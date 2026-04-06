from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, BackgroundTasks
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.document import Document
from app.models.transaction import Transaction
from app.schemas.document import DocumentCreate, DocumentResponse, DocumentUpdate, DocumentList
from app.services.document_pipeline import enqueue_document_processing, process_document_pipeline
import os
import uuid
from datetime import datetime

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])

# TODO: Add authentication and get tenant_id from token
CURRENT_TENANT_ID = 1

@router.post("/", response_model=DocumentResponse)
async def create_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    document_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Upload a new document."""
    # TODO: Get tenant_id from authenticated user
    tenant_id = CURRENT_TENANT_ID

    # Validate file type
    file_ext = file.filename.split(".")[-1].lower()
    if file_ext not in ["pdf", "jpg", "jpeg", "png", "tiff"]:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    # Generate unique filename
    file_id = str(uuid.uuid4())
    filename = f"{file_id}_{file.filename}"
    file_path = f"./uploads/{tenant_id}/{filename}"

    # Ensure upload directory exists
    os.makedirs(os.path.dirname(file_path), exist_ok=True)

    # Save file
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    # Create document record
    db_document = Document(
        tenant_id=tenant_id,
        filename=file.filename,
        file_path=file_path,
        file_type=file_ext,
        document_type=document_type or file_ext,
        status="pending"
    )

    db.add(db_document)
    db.commit()
    db.refresh(db_document)

    # Enqueue document processing pipeline in background
    enqueue_document_processing(db_document.id, background_tasks)

    return db_document


@router.get("/", response_model=DocumentList)
async def list_documents(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """List all documents for the tenant."""
    # TODO: Get tenant_id from authenticated user
    tenant_id = CURRENT_TENANT_ID

    query = db.query(Document).filter(Document.tenant_id == tenant_id)

    if status:
        query = query.filter(Document.status == status)

    total = query.count()
    documents = query.offset((page - 1) * size).limit(size).all()

    pages = (total + size - 1) // size

    return {
        "items": documents,
        "total": total,
        "page": page,
        "size": size,
        "pages": pages,
    }


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific document."""
    # TODO: Get tenant_id from authenticated user
    tenant_id = CURRENT_TENANT_ID

    document = db.query(Document).filter(
        Document.id == document_id,
        Document.tenant_id == tenant_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    return document


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: int,
    document_update: DocumentUpdate,
    db: Session = Depends(get_db)
):
    """Update a document."""
    # TODO: Get tenant_id from authenticated user
    tenant_id = CURRENT_TENANT_ID

    document = db.query(Document).filter(
        Document.id == document_id,
        Document.tenant_id == tenant_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Update fields
    update_data = document_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(document, field, value)

    document.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(document)

    return document


@router.delete("/{document_id}")
async def delete_document(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Delete a document."""
    # TODO: Get tenant_id from authenticated user
    tenant_id = CURRENT_TENANT_ID

    document = db.query(Document).filter(
        Document.id == document_id,
        Document.tenant_id == tenant_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete file if it exists
    if os.path.exists(document.file_path):
        os.remove(document.file_path)

    db.delete(document)
    db.commit()

    return {"message": "Document deleted successfully"}


@router.post("/{document_id}/reprocess")
async def reprocess_document(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Reprocess a document by deleting existing transactions and re-running the pipeline."""
    # TODO: Get tenant_id from authenticated user
    tenant_id = CURRENT_TENANT_ID

    document = db.query(Document).filter(
        Document.id == document_id,
        Document.tenant_id == tenant_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete existing transactions for this document
    deleted_count = db.query(Transaction).filter(
        Transaction.document_id == document.id
    ).delete(synchronize_session=False)

    # Reset document status
    document.status = "pending"
    document.updated_at = datetime.utcnow()
    db.commit()

    # Reprocess document synchronously
    results = process_document_pipeline(document_id, db)

    return {
        "message": f"Document reprocessed successfully",
        "document_id": document_id,
        "deleted_transactions": deleted_count,
        "new_transactions": results.get("total_transactions", 0),
        "success": results.get("success", False),
        "details": results
    }


@router.post("/reprocess-all")
async def reprocess_all_documents(
    db: Session = Depends(get_db)
):
    """Reprocess all completed/failed documents to fix transaction types."""
    # TODO: Get tenant_id from authenticated user
    tenant_id = CURRENT_TENANT_ID

    # Get all documents that have been processed before
    documents = db.query(Document).filter(
        Document.tenant_id == tenant_id,
        Document.status.in_(["completed", "failed"])
    ).all()

    results = {
        "total_documents": len(documents),
        "processed": 0,
        "failed": 0,
        "details": []
    }

    for document in documents:
        try:
            # Delete existing transactions
            deleted = db.query(Transaction).filter(
                Transaction.document_id == document.id
            ).delete(synchronize_session=False)

            # Reset status and reprocess
            document.status = "pending"
            document.updated_at = datetime.utcnow()
            db.commit()

            doc_results = process_document_pipeline(document.id, db)

            if doc_results.get("success"):
                results["processed"] += 1
            else:
                results["failed"] += 1

            results["details"].append({
                "document_id": document.id,
                "filename": document.filename,
                "deleted_transactions": deleted,
                "new_transactions": doc_results.get("total_transactions", 0),
                "success": doc_results.get("success", False),
                "error": doc_results.get("error")
            })

        except Exception as e:
            results["failed"] += 1
            results["details"].append({
                "document_id": document.id,
                "filename": document.filename,
                "error": str(e)
            })

    return results
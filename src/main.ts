import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);

  const apiPrefix = 'api/v1';

  app.setGlobalPrefix(apiPrefix, {
    exclude: ['health', 'ready'],
  });

  app.use(
    `/${apiPrefix}/payment/webhook`,
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  // Explicit JSON body parser — NestJS 11 may not enable it by default
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const corsOrigins = config.get<string>('CORS_ORIGINS');
  const origin = corsOrigins
    ? corsOrigins.split(',').map((value) => value.trim())
    : true;
  app.enableCors({ origin, credentials: true });

  app.use(helmet());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Primlook API')
    .setDescription('Primlook backend API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'jwt',
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(config.get<number>('PORT') ?? 3000);

  const rawUrl = await app.getUrl();
  const baseUrl = rawUrl.replace('[::1]', 'localhost');
  logger.log(`Service URL: ${baseUrl}`);
  logger.log(`API URL: ${baseUrl}/api/v1`);
  logger.log(`Swagger URL: ${baseUrl}/docs`);
}
bootstrap();

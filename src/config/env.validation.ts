import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('24h'),
  FRONTEND_URL: Joi.string().allow('').optional(),
  VENDOR_PAYMENT_CALLBACK_URL: Joi.string().allow('').optional(),
  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().allow(null).optional().empty(''),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  SMTP_FROM: Joi.string().allow('').optional(),
  CLOUDINARY_CLOUDNAME: Joi.string().allow('').optional(),
  CLOUDINARY_APIKEY: Joi.string().allow('').optional(),
  CLOUDINARY_APISECRET: Joi.string().allow('').optional(),
  PAYSTACK_SECRET_KEY: Joi.string().allow('').optional(),
  PAYSTACK_BASE_URL: Joi.string().allow('').optional(),
  OTP_TTL_MINUTES: Joi.number().default(10),
  OTP_MAX_ATTEMPTS: Joi.number().default(5),
  OTP_VERIFIED_TTL_MINUTES: Joi.number().default(10),
  PASSWORD_RESET_TTL_MINUTES: Joi.number().default(15),
  GOOGLE_MAPS_API_KEY: Joi.string().allow('').optional(),
  CORS_ORIGINS: Joi.string().allow('').optional(),
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(60),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info'),
});

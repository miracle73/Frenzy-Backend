import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './env.validation';

const envFilePath =
  process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : ['.env'];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      envFilePath,
    }),
  ],
})
export class AppConfigModule {}

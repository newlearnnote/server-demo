import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import * as cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Add cookie parser middleware
  app.use(cookieParser());
  app.setGlobalPrefix('api');

  // CORS configuration (credentials: true added for cookie support)
  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Refresh-Token'],
    credentials: true, // Allow cookies
  });

  // Global pipe configuration
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global filter configuration (error handling)
  app.useGlobalFilters(new PrismaExceptionFilter(), new AllExceptionsFilter());

  // Global interceptor configuration (unified response format)
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('NewLearnNote API')
    .setDescription('NewLearnNote 프로젝트 API 문서')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth', // This name here is important for matching up with @ApiBearerAuth() in your controller!
    )
    .addCookieAuth('refresh_token', {
      type: 'apiKey',
      in: 'cookie',
      name: 'refresh_token',
      description: 'Refresh token stored in cookie',
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // JWT 토큰을 브라우저에 기억
      tagsSorter: 'alpha', // 태그를 알파벳 순으로 정렬
      operationsSorter: 'alpha', // 메서드를 알파벳 순으로 정렬
    },
    customSiteTitle: 'NewLearnNote API 문서',
    customfavIcon: '/uploads/favicon.ico',
    customCss: `
      .topbar-wrapper .link {
        content: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="%23ffffff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>');
        width: 40px;
        height: 40px;
      }
      .swagger-ui .topbar { background-color: #1976d2; }
    `, // 선택사항: 커스텀 CSS
  });

  const port = process.env.PORT ?? 8000;
  await app.listen(port);
}

bootstrap().catch((error) => console.error(error));

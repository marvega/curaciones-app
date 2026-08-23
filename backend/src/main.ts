import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { assertOauthEnv } from './oauth/oauth-env';
import { resolveTrustProxyHops } from './common/trust-proxy';

async function bootstrap() {
  // Before anything else: a production deploy missing OAUTH_ISSUER or
  // OAUTH_COOKIE_SECRET must die here, not open a port and a database pool
  // and then serve traffic with a repository-published cookie key.
  assertOauthEnv();

  const app = await NestFactory.create(AppModule);

  // Trust a bounded number of reverse-proxy hops, never the whole chain.
  // `true` made req.ip the left-most X-Forwarded-For element, which is
  // whatever the caller sent — see src/common/trust-proxy.ts.
  const trustProxyHops = resolveTrustProxyHops();
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
    const config = new DocumentBuilder()
      .setTitle('Curaciones API')
      .setDescription('API for clinical wound care management')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    console.log('Swagger UI available at /api/docs');
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Backend corriendo en puerto ${port} (trust proxy hops: ${trustProxyHops})`);
}
bootstrap();

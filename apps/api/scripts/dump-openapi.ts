import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

/** Dumps the same OpenAPI document main.ts serves at `/api/docs` to a JSON file on disk, without
 * starting an HTTP listener — the source of truth for the SDK/OpenAPI contract test in
 * apps/web/scripts/check-api-contract.ts (see docs/ci-cd.md). Requires the same Postgres/Redis/S3
 * connectivity as the app itself (module registration eagerly connects some of these), so this
 * only runs where that's available — CI's service containers, or a local `docker compose up`. */
async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NovaDrive API')
    .setDescription('NovaDrive cloud storage platform API')
    .setVersion('0.0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  const outPath = join(__dirname, '..', 'openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2));
  console.log(`OpenAPI spec written to ${outPath}`);

  await app.close();
}

main().catch((error: unknown) => {
  console.error('Failed to dump OpenAPI spec:', error);
  process.exit(1);
});

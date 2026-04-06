import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";

function parseCorsOrigins(): string[] {
  const fromEnv = process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const defaults = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001"
  ];
  return fromEnv.length > 0 ? [...new Set([...fromEnv, ...defaults])] : defaults;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: parseCorsOrigins(),
    credentials: true
  });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false
    })
  );
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 4000, "0.0.0.0");
}

void bootstrap();

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger:
      process.env.NODE_ENV === "production"
        ? ["error", "warn", "log"]
        : undefined,
  });

  // Behind Cloudflare / Traefik — correct client IP for rate limits
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: false, // Next serves the UI; API is JSON only
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );

  // Small bodies only — blocks oversized bot payloads
  app.useBodyParser("json", { limit: "32kb" });
  app.useBodyParser("urlencoded", { limit: "32kb", extended: false });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  if (process.env.NODE_ENV === "production" && !corsOrigin) {
    throw new Error("CORS_ORIGIN is required in production");
  }
  app.enableCors({
    origin: corsOrigin
      ? corsOrigin.split(",").map((o) => o.trim()).filter(Boolean)
      : false,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  });

  const port = Number(process.env.PORT ?? 3001);
  // Bind all interfaces inside the container; only Docker/Traefik should reach it
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`Carrera de Tiempo API on :${port}`);
}

bootstrap();

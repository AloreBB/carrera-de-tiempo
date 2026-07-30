-- CreateEnum
CREATE TYPE "RaceStatus" AS ENUM ('LOBBY', 'COUNTDOWN', 'RACING', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JoinMode" AS ENUM ('OPEN', 'APPROVAL');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'LEFT', 'FINISHED');

-- CreateTable
CREATE TABLE "Race" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "RaceStatus" NOT NULL DEFAULT 'LOBBY',
    "joinMode" "JoinMode" NOT NULL DEFAULT 'OPEN',
    "pinHash" TEXT,
    "destLat" DOUBLE PRECISION NOT NULL,
    "destLng" DOUBLE PRECISION NOT NULL,
    "destLabel" TEXT,
    "hostClientId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "finishRadiusM" INTEGER NOT NULL DEFAULT 80,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Race_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "color" TEXT,
    "startLat" DOUBLE PRECISION,
    "startLng" DOUBLE PRECISION,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionSample" (
    "id" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PositionSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaceResult" (
    "id" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaceResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Race_code_key" ON "Race"("code");

-- CreateIndex
CREATE INDEX "Participant_raceId_idx" ON "Participant"("raceId");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_raceId_clientId_key" ON "Participant"("raceId", "clientId");

-- CreateIndex
CREATE INDEX "PositionSample_raceId_participantId_recordedAt_idx" ON "PositionSample"("raceId", "participantId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RaceResult_raceId_key" ON "RaceResult"("raceId");

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionSample" ADD CONSTRAINT "PositionSample_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE CASCADE ON UPDATE CASCADE;

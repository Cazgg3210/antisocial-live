-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ORGANIZATION_ADMIN', 'EVENT_MANAGER', 'STAGE_OPERATOR', 'STAFF_COORDINATOR');

-- CreateEnum
CREATE TYPE "EventMode" AS ENUM ('REHEARSAL', 'LIVE');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'CONFIGURING', 'READY', 'LIVE', 'CLOSING', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('PENDING', 'ACTIVE', 'SCORED', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PerformanceStatus" AS ENUM ('SCHEDULED', 'ON_STAGE', 'VOTING_OPEN', 'GRACE_PERIOD', 'VOTING_CLOSED', 'CALCULATING', 'RESULT_READY', 'PARTIAL_REVEALED', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StageSceneType" AS ENUM ('WELCOME', 'NEXT_BAND', 'BAND_PLAYING', 'VOTE_NOW', 'VOTING_COUNTDOWN', 'VOTING_CLOSED', 'CALCULATING', 'PARTIAL_RESULT', 'BREAK', 'SPONSOR', 'FINAL_COUNTDOWN', 'LEADERBOARD', 'QUALIFIERS', 'WINNER', 'TECHNICAL_HOLD');

-- CreateEnum
CREATE TYPE "TimerStatus" AS ENUM ('IDLE', 'RUNNING', 'PAUSED', 'OVERTIME', 'STOPPED');

-- CreateEnum
CREATE TYPE "GroupKind" AS ENUM ('PUBLIC', 'STAFF', 'JUDGE');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'ACCEPTED', 'REJECTED', 'FLAGGED_FOR_REVIEW');

-- CreateEnum
CREATE TYPE "AggregationMethod" AS ENUM ('MEAN', 'MEDIAN', 'TRIMMED_MEAN');

-- CreateEnum
CREATE TYPE "MissingEvaluatorPolicy" AS ENUM ('REDISTRIBUTE', 'REQUIRE_MIN', 'ZERO_WEIGHT');

-- CreateEnum
CREATE TYPE "MinVotesPolicy" AS ENUM ('BLOCK', 'REDISTRIBUTE', 'ZERO_WEIGHT');

-- CreateEnum
CREATE TYPE "VoterNormalization" AS ENUM ('NONE', 'Z_SCORE_PER_VOTER');

-- CreateEnum
CREATE TYPE "JudgeNormalization" AS ENUM ('NONE', 'Z_SCORE_PER_JUDGE');

-- CreateEnum
CREATE TYPE "PartialRevealPolicy" AS ENUM ('NONE', 'JUDGES_ONLY', 'STAFF_ONLY', 'JUDGES_AND_STAFF', 'ALL_GROUPS', 'FINAL_ONLY');

-- CreateEnum
CREATE TYPE "RevealOrder" AS ENUM ('ASCENDING', 'DESCENDING', 'ALPHABETICAL');

-- CreateEnum
CREATE TYPE "RevealStyle" AS ENUM ('ONE_BY_ONE', 'ALL_AT_ONCE');

-- CreateEnum
CREATE TYPE "OvertimePolicy" AS ENUM ('NONE', 'TIE_BREAKER', 'PENALTY');

-- CreateEnum
CREATE TYPE "RoundingMode" AS ENUM ('HALF_UP', 'HALF_EVEN');

-- CreateEnum
CREATE TYPE "ScorecardVariant" AS ENUM ('FULL', 'QUICK');

-- CreateEnum
CREATE TYPE "BandReportLevel" AS ENUM ('NONE', 'SUMMARY', 'DETAILED');

-- CreateEnum
CREATE TYPE "QualificationStatus" AS ENUM ('PENDING', 'QUALIFIED', 'ELIMINATED');

-- CreateEnum
CREATE TYPE "TokenKind" AS ENUM ('JUDGE', 'STAFF', 'BAND_MANAGER');

-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PlacementKind" AS ENUM ('STAGE_TRANSITION', 'STAGE_BREAK', 'STAGE_PRESENTED_BY', 'VOTE_LANDING_HEADER', 'THANK_YOU_CTA', 'BAND_REPORT_FOOTER', 'RECAP_EMAIL');

-- CreateEnum
CREATE TYPE "InteractionKind" AS ENUM ('IMPRESSION', 'CLICK', 'QR_SCAN');

-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('PRIVACY_NOTICE', 'MARKETING_EMAIL', 'MARKETING_WHATSAPP', 'FOLLOW_BAND', 'CONTEST_RULES', 'IMAGE_RIGHTS');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'UNSUBSCRIBED', 'DELETED');

-- CreateEnum
CREATE TYPE "AttributionKind" AS ENUM ('RESERVATION_CLICK', 'RESERVATION_CONFIRMED', 'BAND_FOLLOW', 'SPONSOR_CLICK', 'OPT_IN');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'EVALUATOR', 'VOTER', 'BAND_MANAGER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DataRequestKind" AS ENUM ('ACCESS', 'RECTIFICATION', 'CANCELLATION', 'OPPOSITION');

-- CreateEnum
CREATE TYPE "DataRequestStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('JUDGES', 'STAFF', 'CONTROL', 'ALL_EVALUATORS');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT,
    "address" TEXT,
    "contactEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es-MX',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluatorAssignment" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "group" "GroupKind" NOT NULL,
    "individualWeightBp" INTEGER NOT NULL DEFAULT 10000,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "pinHash" TEXT,
    "deviceId" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluatorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" "TokenKind" NOT NULL,
    "eventId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "bandId" TEXT,
    "status" "TokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflictOfInterest" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "bandId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConflictOfInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSeries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventEdition" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "mode" "EventMode" NOT NULL DEFAULT 'REHEARSAL',
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "expectedAttendance" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventEdition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventConfig" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "graceSeconds" INTEGER NOT NULL DEFAULT 5,
    "allowVoteEdit" BOOLEAN NOT NULL DEFAULT false,
    "screenCodeRequired" BOOLEAN NOT NULL DEFAULT true,
    "screenCodeRotationSec" INTEGER NOT NULL DEFAULT 60,
    "turnstileEnabled" BOOLEAN NOT NULL DEFAULT false,
    "publicScorecardVariant" "ScorecardVariant" NOT NULL DEFAULT 'FULL',
    "voterNormalization" "VoterNormalization" NOT NULL DEFAULT 'NONE',
    "multiBandVoterBoostBp" INTEGER NOT NULL DEFAULT 10000,
    "multiBandVoterMin" INTEGER NOT NULL DEFAULT 2,
    "porraPatternFlag" BOOLEAN NOT NULL DEFAULT true,
    "bayesianPriorVotes" INTEGER NOT NULL DEFAULT 0,
    "judgeNormalization" "JudgeNormalization" NOT NULL DEFAULT 'NONE',
    "decimalPrecision" INTEGER NOT NULL DEFAULT 2,
    "roundingMode" "RoundingMode" NOT NULL DEFAULT 'HALF_UP',
    "partialRevealPolicy" "PartialRevealPolicy" NOT NULL DEFAULT 'JUDGES_ONLY',
    "finalRevealOrder" "RevealOrder" NOT NULL DEFAULT 'ASCENDING',
    "finalRevealStyle" "RevealStyle" NOT NULL DEFAULT 'ONE_BY_ONE',
    "requireResultApproval" BOOLEAN NOT NULL DEFAULT false,
    "showVoteCountPublicly" BOOLEAN NOT NULL DEFAULT true,
    "timerPlannedSeconds" INTEGER NOT NULL DEFAULT 2700,
    "timerReminderOffsets" INTEGER[] DEFAULT ARRAY[600, 300, 120, 0, -120]::INTEGER[],
    "stageShowTimer" BOOLEAN NOT NULL DEFAULT false,
    "overtimePolicy" "OvertimePolicy" NOT NULL DEFAULT 'NONE',
    "overtimePenaltyBp" INTEGER NOT NULL DEFAULT 0,
    "tieBreakers" JSONB NOT NULL DEFAULT '[{"kind":"JUDGE_SCORE"},{"kind":"PUBLIC_SCORE"},{"kind":"CRITERION","criterionKey":"conexion"},{"kind":"MANUAL"}]',
    "bandReportEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bandReportLevel" "BandReportLevel" NOT NULL DEFAULT 'SUMMARY',
    "postVoteShowBandProfile" BOOLEAN NOT NULL DEFAULT true,
    "postVoteShowOptIn" BOOLEAN NOT NULL DEFAULT true,
    "postVoteShowReservation" BOOLEAN NOT NULL DEFAULT true,
    "reservationUrl" TEXT,
    "postVoteShowSponsor" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VotingGroup" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "GroupKind" NOT NULL,
    "name" TEXT NOT NULL,
    "weightBp" INTEGER NOT NULL,
    "aggregation" "AggregationMethod" NOT NULL DEFAULT 'MEAN',
    "trimPercentBp" INTEGER NOT NULL DEFAULT 1000,
    "minSubmissions" INTEGER NOT NULL DEFAULT 1,
    "minVotesPolicy" "MinVotesPolicy" NOT NULL DEFAULT 'BLOCK',
    "missingEvaluatorPolicy" "MissingEvaluatorPolicy" NOT NULL DEFAULT 'REDISTRIBUTE',
    "requiredEvaluatorCount" INTEGER NOT NULL DEFAULT 1,
    "scorecardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VotingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScorecardTemplate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScorecardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Criterion" (
    "id" TEXT NOT NULL,
    "scorecardId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameEs" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionEs" TEXT,
    "descriptionEn" TEXT,
    "order" INTEGER NOT NULL,
    "weightBp" INTEGER NOT NULL,
    "scaleMin" INTEGER NOT NULL DEFAULT 1,
    "scaleMax" INTEGER NOT NULL DEFAULT 10,
    "countsTowardScore" BOOLEAN NOT NULL DEFAULT true,
    "includedInQuick" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Criterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationSnapshot" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigurationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'PENDING',
    "qualifiersCount" INTEGER NOT NULL DEFAULT 1,
    "nextRoundId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Band" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isTribute" BOOLEAN NOT NULL DEFAULT false,
    "genre" TEXT,
    "city" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "instagram" TEXT,
    "tiktok" TEXT,
    "spotify" TEXT,
    "youtube" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "membersJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Band_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Performance" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "bandId" TEXT NOT NULL,
    "slotOrder" INTEGER NOT NULL,
    "status" "PerformanceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "configurationSnapshotId" TEXT,
    "currentResultId" TEXT,
    "onStageAt" TIMESTAMP(3),
    "votingOpenedAt" TIMESTAMP(3),
    "votingClosedAt" TIMESTAMP(3),
    "graceUntil" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceTimer" (
    "id" TEXT NOT NULL,
    "performanceId" TEXT NOT NULL,
    "status" "TimerStatus" NOT NULL DEFAULT 'IDLE',
    "plannedSeconds" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "pausedTotalSeconds" INTEGER NOT NULL DEFAULT 0,
    "stoppedAt" TIMESTAMP(3),
    "actualSeconds" INTEGER,
    "overtimeSeconds" INTEGER,
    "remindersSent" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceTimer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoterSession" (
    "id" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "turnstileVerifiedAt" TIMESTAMP(3),
    "locale" TEXT NOT NULL DEFAULT 'es-MX',
    "uaSummary" TEXT,

    CONSTRAINT "VoterSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoterEventState" (
    "id" TEXT NOT NULL,
    "voterSessionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ipHash" TEXT,
    "refBandId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoterEventState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSecuritySalt" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "salt" TEXT,
    "destroyedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventSecuritySalt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreSubmission" (
    "id" TEXT NOT NULL,
    "submissionKey" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "performanceId" TEXT NOT NULL,
    "group" "GroupKind" NOT NULL,
    "voterSessionId" TEXT,
    "assignmentId" TEXT,
    "scorecardVariant" "ScorecardVariant" NOT NULL DEFAULT 'FULL',
    "status" "SubmissionStatus" NOT NULL DEFAULT 'ACCEPTED',
    "riskScoreBp" INTEGER NOT NULL DEFAULT 0,
    "riskSignals" JSONB NOT NULL DEFAULT '[]',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedInGrace" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "unlockedAt" TIMESTAMP(3),
    "unlockedBy" TEXT,
    "unlockReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewReason" TEXT,
    "comment" TEXT,
    "clientDurationMs" INTEGER,
    "locale" TEXT NOT NULL DEFAULT 'es-MX',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreItem" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "ScoreItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionRevision" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "itemsJson" JSONB NOT NULL,
    "comment" TEXT,
    "status" "SubmissionStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultSnapshot" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "performanceId" TEXT NOT NULL,
    "configurationSnapshotId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "finalScore" DECIMAL(12,6) NOT NULL,
    "hash" TEXT NOT NULL,
    "previousHash" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculatedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "partialRevealedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,

    CONSTRAINT "ResultSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ranking" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Ranking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Qualification" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "performanceId" TEXT NOT NULL,
    "bandId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "finalScore" DECIMAL(12,6) NOT NULL,
    "status" "QualificationStatus" NOT NULL DEFAULT 'PENDING',
    "tieBreakApplied" JSONB,
    "advancedToPerformanceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TieBreakDecision" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "bandIds" TEXT[],
    "method" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "decidedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TieBreakDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageScene" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "StageSceneType" NOT NULL DEFAULT 'WELCOME',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorLock" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'WARNING',
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "performanceId" TEXT,
    "audience" "NotificationAudience" NOT NULL,
    "kind" TEXT NOT NULL,
    "titleEs" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "bodyEs" TEXT,
    "bodyEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "performanceId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "ipHash" TEXT,
    "requestId" TEXT,
    "previousHash" TEXT,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sponsor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorPlacement" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "eventId" TEXT,
    "kind" "PlacementKind" NOT NULL,
    "code" TEXT NOT NULL,
    "imageUrl" TEXT,
    "headlineEs" TEXT,
    "headlineEn" TEXT,
    "ctaLabelEs" TEXT,
    "ctaLabelEn" TEXT,
    "ctaUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorInteraction" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "kind" "InteractionKind" NOT NULL,
    "eventId" TEXT,
    "performanceId" TEXT,
    "voterSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsorInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'es-MX',
    "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL,
    "eventId" TEXT,
    "refBandId" TEXT,
    "voterSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "textShown" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "contactId" TEXT,
    "voterSessionId" TEXT,
    "applicationId" TEXT,
    "bandId" TEXT,
    "ipHash" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attribution" (
    "id" TEXT NOT NULL,
    "kind" "AttributionKind" NOT NULL,
    "eventId" TEXT NOT NULL,
    "bandId" TEXT,
    "placementId" TEXT,
    "voterSessionId" TEXT,
    "contactId" TEXT,
    "url" TEXT,
    "utm" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BandReport" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "bandId" TEXT NOT NULL,
    "performanceId" TEXT NOT NULL,
    "level" "BandReportLevel" NOT NULL,
    "payload" JSONB NOT NULL,
    "viewTokenHash" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sentTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BandReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationCall" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleEs" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "descriptionEs" TEXT,
    "descriptionEn" TEXT,
    "status" "CallStatus" NOT NULL DEFAULT 'DRAFT',
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "fieldsSchema" JSONB NOT NULL DEFAULT '[]',
    "rulesVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BandApplication" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "bandName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "isTribute" BOOLEAN NOT NULL DEFAULT false,
    "genre" TEXT,
    "city" TEXT,
    "description" TEXT,
    "instagram" TEXT,
    "tiktok" TEXT,
    "spotify" TEXT,
    "youtube" TEXT,
    "videoUrl" TEXT,
    "membersJson" JSONB,
    "riderUrl" TEXT,
    "stagePlotUrl" TEXT,
    "availability" TEXT,
    "notes" TEXT,
    "extraFields" JSONB NOT NULL DEFAULT '{}',
    "editTokenHash" TEXT,
    "acceptedBandId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BandApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationReview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "score" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataKind" TEXT NOT NULL,
    "retentionDays" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "DataRequestKind" NOT NULL,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "email" TEXT NOT NULL,
    "details" TEXT,
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_organizationId_slug_key" ON "Venue"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "RoleAssignment_eventId_idx" ON "RoleAssignment"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleAssignment_userId_role_eventId_key" ON "RoleAssignment"("userId", "role", "eventId");

-- CreateIndex
CREATE INDEX "Person_organizationId_idx" ON "Person"("organizationId");

-- CreateIndex
CREATE INDEX "EvaluatorAssignment_eventId_group_idx" ON "EvaluatorAssignment"("eventId", "group");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluatorAssignment_personId_eventId_group_key" ON "EvaluatorAssignment"("personId", "eventId", "group");

-- CreateIndex
CREATE UNIQUE INDEX "AccessToken_tokenHash_key" ON "AccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccessToken_eventId_kind_idx" ON "AccessToken"("eventId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ConflictOfInterest_assignmentId_bandId_key" ON "ConflictOfInterest"("assignmentId", "bandId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSeries_organizationId_slug_key" ON "EventSeries"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "EventEdition_slug_key" ON "EventEdition"("slug");

-- CreateIndex
CREATE INDEX "EventEdition_seriesId_idx" ON "EventEdition"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "EventConfig_eventId_key" ON "EventConfig"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "VotingGroup_eventId_kind_key" ON "VotingGroup"("eventId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Criterion_scorecardId_key_key" ON "Criterion"("scorecardId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigurationSnapshot_eventId_version_key" ON "ConfigurationSnapshot"("eventId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Round_eventId_order_key" ON "Round"("eventId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Band_organizationId_slug_key" ON "Band"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Performance_currentResultId_key" ON "Performance"("currentResultId");

-- CreateIndex
CREATE INDEX "Performance_status_idx" ON "Performance"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Performance_roundId_bandId_key" ON "Performance"("roundId", "bandId");

-- CreateIndex
CREATE UNIQUE INDEX "Performance_roundId_slotOrder_key" ON "Performance"("roundId", "slotOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceTimer_performanceId_key" ON "PerformanceTimer"("performanceId");

-- CreateIndex
CREATE UNIQUE INDEX "VoterSession_secretHash_key" ON "VoterSession"("secretHash");

-- CreateIndex
CREATE INDEX "VoterEventState_eventId_ipHash_idx" ON "VoterEventState"("eventId", "ipHash");

-- CreateIndex
CREATE UNIQUE INDEX "VoterEventState_voterSessionId_eventId_key" ON "VoterEventState"("voterSessionId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSecuritySalt_eventId_key" ON "EventSecuritySalt"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreSubmission_submissionKey_key" ON "ScoreSubmission"("submissionKey");

-- CreateIndex
CREATE INDEX "ScoreSubmission_performanceId_group_status_idx" ON "ScoreSubmission"("performanceId", "group", "status");

-- CreateIndex
CREATE INDEX "ScoreSubmission_eventId_voterSessionId_idx" ON "ScoreSubmission"("eventId", "voterSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreSubmission_performanceId_voterSessionId_key" ON "ScoreSubmission"("performanceId", "voterSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreSubmission_performanceId_assignmentId_key" ON "ScoreSubmission"("performanceId", "assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreItem_submissionId_criterionId_key" ON "ScoreItem"("submissionId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionRevision_submissionId_revision_key" ON "SubmissionRevision"("submissionId", "revision");

-- CreateIndex
CREATE INDEX "ResultSnapshot_performanceId_calculatedAt_idx" ON "ResultSnapshot"("performanceId", "calculatedAt");

-- CreateIndex
CREATE INDEX "Ranking_roundId_createdAt_idx" ON "Ranking"("roundId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Qualification_performanceId_key" ON "Qualification"("performanceId");

-- CreateIndex
CREATE UNIQUE INDEX "Qualification_roundId_bandId_key" ON "Qualification"("roundId", "bandId");

-- CreateIndex
CREATE UNIQUE INDEX "StageScene_eventId_key" ON "StageScene"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorLock_eventId_key" ON "OperatorLock"("eventId");

-- CreateIndex
CREATE INDEX "Incident_eventId_createdAt_idx" ON "Incident"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_eventId_createdAt_idx" ON "Notification"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_eventId_createdAt_idx" ON "AuditEvent"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE UNIQUE INDEX "Sponsor_organizationId_slug_key" ON "Sponsor"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorPlacement_code_key" ON "SponsorPlacement"("code");

-- CreateIndex
CREATE INDEX "SponsorPlacement_eventId_kind_isActive_idx" ON "SponsorPlacement"("eventId", "kind", "isActive");

-- CreateIndex
CREATE INDEX "SponsorInteraction_placementId_kind_createdAt_idx" ON "SponsorInteraction"("placementId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AudienceContact_organizationId_email_idx" ON "AudienceContact"("organizationId", "email");

-- CreateIndex
CREATE INDEX "AudienceContact_organizationId_phone_idx" ON "AudienceContact"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "Consent_contactId_kind_idx" ON "Consent"("contactId", "kind");

-- CreateIndex
CREATE INDEX "Consent_bandId_kind_idx" ON "Consent"("bandId", "kind");

-- CreateIndex
CREATE INDEX "Attribution_eventId_kind_idx" ON "Attribution"("eventId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "BandReport_viewTokenHash_key" ON "BandReport"("viewTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "BandReport_performanceId_bandId_key" ON "BandReport"("performanceId", "bandId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationCall_slug_key" ON "ApplicationCall"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "BandApplication_editTokenHash_key" ON "BandApplication"("editTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "BandApplication_acceptedBandId_key" ON "BandApplication"("acceptedBandId");

-- CreateIndex
CREATE INDEX "BandApplication_callId_status_idx" ON "BandApplication"("callId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationReview_applicationId_reviewerId_key" ON "ApplicationReview"("applicationId", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_organizationId_dataKind_key" ON "RetentionPolicy"("organizationId", "dataKind");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_organizationId_kind_key" ON "Integration"("organizationId", "kind");

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluatorAssignment" ADD CONSTRAINT "EvaluatorAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluatorAssignment" ADD CONSTRAINT "EvaluatorAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "EvaluatorAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictOfInterest" ADD CONSTRAINT "ConflictOfInterest_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "EvaluatorAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictOfInterest" ADD CONSTRAINT "ConflictOfInterest_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventEdition" ADD CONSTRAINT "EventEdition_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventEdition" ADD CONSTRAINT "EventEdition_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventConfig" ADD CONSTRAINT "EventConfig_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingGroup" ADD CONSTRAINT "VotingGroup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingGroup" ADD CONSTRAINT "VotingGroup_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "ScorecardTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardTemplate" ADD CONSTRAINT "ScorecardTemplate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Criterion" ADD CONSTRAINT "Criterion_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "ScorecardTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationSnapshot" ADD CONSTRAINT "ConfigurationSnapshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_nextRoundId_fkey" FOREIGN KEY ("nextRoundId") REFERENCES "Round"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Band" ADD CONSTRAINT "Band_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Performance" ADD CONSTRAINT "Performance_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Performance" ADD CONSTRAINT "Performance_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Performance" ADD CONSTRAINT "Performance_configurationSnapshotId_fkey" FOREIGN KEY ("configurationSnapshotId") REFERENCES "ConfigurationSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Performance" ADD CONSTRAINT "Performance_currentResultId_fkey" FOREIGN KEY ("currentResultId") REFERENCES "ResultSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceTimer" ADD CONSTRAINT "PerformanceTimer_performanceId_fkey" FOREIGN KEY ("performanceId") REFERENCES "Performance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoterEventState" ADD CONSTRAINT "VoterEventState_voterSessionId_fkey" FOREIGN KEY ("voterSessionId") REFERENCES "VoterSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoterEventState" ADD CONSTRAINT "VoterEventState_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoterEventState" ADD CONSTRAINT "VoterEventState_refBandId_fkey" FOREIGN KEY ("refBandId") REFERENCES "Band"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSecuritySalt" ADD CONSTRAINT "EventSecuritySalt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSubmission" ADD CONSTRAINT "ScoreSubmission_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSubmission" ADD CONSTRAINT "ScoreSubmission_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSubmission" ADD CONSTRAINT "ScoreSubmission_performanceId_fkey" FOREIGN KEY ("performanceId") REFERENCES "Performance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSubmission" ADD CONSTRAINT "ScoreSubmission_voterSessionId_fkey" FOREIGN KEY ("voterSessionId") REFERENCES "VoterSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSubmission" ADD CONSTRAINT "ScoreSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "EvaluatorAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreItem" ADD CONSTRAINT "ScoreItem_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ScoreSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreItem" ADD CONSTRAINT "ScoreItem_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionRevision" ADD CONSTRAINT "SubmissionRevision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ScoreSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSnapshot" ADD CONSTRAINT "ResultSnapshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSnapshot" ADD CONSTRAINT "ResultSnapshot_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSnapshot" ADD CONSTRAINT "ResultSnapshot_performanceId_fkey" FOREIGN KEY ("performanceId") REFERENCES "Performance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSnapshot" ADD CONSTRAINT "ResultSnapshot_configurationSnapshotId_fkey" FOREIGN KEY ("configurationSnapshotId") REFERENCES "ConfigurationSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ranking" ADD CONSTRAINT "Ranking_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Qualification" ADD CONSTRAINT "Qualification_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Qualification" ADD CONSTRAINT "Qualification_performanceId_fkey" FOREIGN KEY ("performanceId") REFERENCES "Performance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Qualification" ADD CONSTRAINT "Qualification_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TieBreakDecision" ADD CONSTRAINT "TieBreakDecision_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageScene" ADD CONSTRAINT "StageScene_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorLock" ADD CONSTRAINT "OperatorLock_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorLock" ADD CONSTRAINT "OperatorLock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_performanceId_fkey" FOREIGN KEY ("performanceId") REFERENCES "Performance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsor" ADD CONSTRAINT "Sponsor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorPlacement" ADD CONSTRAINT "SponsorPlacement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorPlacement" ADD CONSTRAINT "SponsorPlacement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorInteraction" ADD CONSTRAINT "SponsorInteraction_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "SponsorPlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorInteraction" ADD CONSTRAINT "SponsorInteraction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorInteraction" ADD CONSTRAINT "SponsorInteraction_performanceId_fkey" FOREIGN KEY ("performanceId") REFERENCES "Performance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorInteraction" ADD CONSTRAINT "SponsorInteraction_voterSessionId_fkey" FOREIGN KEY ("voterSessionId") REFERENCES "VoterSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceContact" ADD CONSTRAINT "AudienceContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceContact" ADD CONSTRAINT "AudienceContact_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceContact" ADD CONSTRAINT "AudienceContact_refBandId_fkey" FOREIGN KEY ("refBandId") REFERENCES "Band"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceContact" ADD CONSTRAINT "AudienceContact_voterSessionId_fkey" FOREIGN KEY ("voterSessionId") REFERENCES "VoterSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "AudienceContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_voterSessionId_fkey" FOREIGN KEY ("voterSessionId") REFERENCES "VoterSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "BandApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_voterSessionId_fkey" FOREIGN KEY ("voterSessionId") REFERENCES "VoterSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "AudienceContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandReport" ADD CONSTRAINT "BandReport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandReport" ADD CONSTRAINT "BandReport_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandReport" ADD CONSTRAINT "BandReport_performanceId_fkey" FOREIGN KEY ("performanceId") REFERENCES "Performance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationCall" ADD CONSTRAINT "ApplicationCall_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandApplication" ADD CONSTRAINT "BandApplication_callId_fkey" FOREIGN KEY ("callId") REFERENCES "ApplicationCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandApplication" ADD CONSTRAINT "BandApplication_acceptedBandId_fkey" FOREIGN KEY ("acceptedBandId") REFERENCES "Band"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationReview" ADD CONSTRAINT "ApplicationReview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "BandApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRequest" ADD CONSTRAINT "DataRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────────────────── INTEGRITY LAYER (hand-written) ─────────────────────────

-- Immutable tables: reject UPDATE/DELETE at the database level.
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only (% not allowed)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_immutable BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER configuration_snapshot_immutable BEFORE UPDATE OR DELETE ON "ConfigurationSnapshot"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- ResultSnapshot: payload/hash/score are frozen; only lifecycle columns may change.
CREATE OR REPLACE FUNCTION result_snapshot_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ResultSnapshot is append-only' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.hash IS DISTINCT FROM OLD.hash
     OR NEW."previousHash" IS DISTINCT FROM OLD."previousHash"
     OR NEW."finalScore" IS DISTINCT FROM OLD."finalScore"
     OR NEW."calculatedAt" IS DISTINCT FROM OLD."calculatedAt"
     OR NEW."configurationSnapshotId" IS DISTINCT FROM OLD."configurationSnapshotId"
     OR NEW."engineVersion" IS DISTINCT FROM OLD."engineVersion" THEN
    RAISE EXCEPTION 'ResultSnapshot computed fields are immutable' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER result_snapshot_guard BEFORE UPDATE OR DELETE ON "ResultSnapshot"
  FOR EACH ROW EXECUTE FUNCTION result_snapshot_guard();

-- Range and weight checks.
ALTER TABLE "Criterion" ADD CONSTRAINT criterion_scale_check CHECK ("scaleMin" < "scaleMax" AND "weightBp" >= 0 AND "weightBp" <= 10000);
ALTER TABLE "VotingGroup" ADD CONSTRAINT voting_group_weight_check CHECK ("weightBp" >= 0 AND "weightBp" <= 10000 AND "trimPercentBp" >= 0 AND "trimPercentBp" < 5000);
ALTER TABLE "EvaluatorAssignment" ADD CONSTRAINT evaluator_weight_check CHECK ("individualWeightBp" > 0);
ALTER TABLE "ScoreSubmission" ADD CONSTRAINT submission_actor_check CHECK (
  ("group" = 'PUBLIC' AND "voterSessionId" IS NOT NULL AND "assignmentId" IS NULL) OR
  ("group" <> 'PUBLIC' AND "assignmentId" IS NOT NULL AND "voterSessionId" IS NULL)
);
ALTER TABLE "Round" ADD CONSTRAINT round_qualifiers_check CHECK ("qualifiersCount" >= 0);
ALTER TABLE "EventConfig" ADD CONSTRAINT event_config_check CHECK (
  "graceSeconds" >= 0 AND "decimalPrecision" BETWEEN 0 AND 6 AND "timerPlannedSeconds" > 0 AND "multiBandVoterBoostBp" >= 10000
);

-- Realtime: notify listeners when operational state changes.
CREATE OR REPLACE FUNCTION notify_realtime() RETURNS trigger AS $$
DECLARE
  event_id text;
BEGIN
  IF TG_TABLE_NAME = 'Performance' THEN
    SELECT r."eventId" INTO event_id FROM "Round" r WHERE r.id = COALESCE(NEW."roundId", OLD."roundId");
  ELSIF TG_TABLE_NAME = 'PerformanceTimer' THEN
    SELECT r."eventId" INTO event_id FROM "Performance" p JOIN "Round" r ON r.id = p."roundId" WHERE p.id = COALESCE(NEW."performanceId", OLD."performanceId");
  ELSE
    event_id := COALESCE(NEW."eventId", OLD."eventId");
  END IF;
  PERFORM pg_notify('antisocial_realtime', json_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'eventId', event_id)::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER performance_notify AFTER INSERT OR UPDATE ON "Performance" FOR EACH ROW EXECUTE FUNCTION notify_realtime();
CREATE TRIGGER stage_scene_notify AFTER INSERT OR UPDATE ON "StageScene" FOR EACH ROW EXECUTE FUNCTION notify_realtime();
CREATE TRIGGER timer_notify AFTER INSERT OR UPDATE ON "PerformanceTimer" FOR EACH ROW EXECUTE FUNCTION notify_realtime();
CREATE TRIGGER submission_notify AFTER INSERT OR UPDATE ON "ScoreSubmission" FOR EACH ROW EXECUTE FUNCTION notify_realtime();
CREATE TRIGGER notification_notify AFTER INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION notify_realtime();
CREATE TRIGGER result_notify AFTER INSERT OR UPDATE ON "ResultSnapshot" FOR EACH ROW EXECUTE FUNCTION notify_realtime();
CREATE TRIGGER event_notify AFTER UPDATE ON "EventEdition" FOR EACH ROW EXECUTE FUNCTION notify_realtime();

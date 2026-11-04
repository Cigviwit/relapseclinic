#!/usr/bin/env bash
# Turns on daily Firestore backups kept for 14 weeks. Costs money on the project, so it is run by hand.
# Usage: scripts/setup-backups.sh <project-id>
set -euo pipefail
PROJECT="${1:?Usage: scripts/setup-backups.sh <project-id>}"

gcloud firestore backups schedules create --project="$PROJECT" --database='(default)' --recurrence=daily --retention=14w
gcloud firestore backups schedules list --project="$PROJECT" --database='(default)'

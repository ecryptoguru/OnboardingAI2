#!/bin/bash
# Set all required Convex Auth environment variables
# Run once: bash setConvexAuth.sh

# Generate fresh keys and capture them
OUTPUT=$(node generateKeys.mjs)

JWT_KEY=$(echo "$OUTPUT" | grep "JWT_PRIVATE_KEY=" | sed 's/JWT_PRIVATE_KEY=//' | tr -d '"')
JWKS=$(echo "$OUTPUT" | grep "JWKS=" | sed 's/JWKS=//')

echo "Setting JWT_PRIVATE_KEY..."
npx convex env set JWT_PRIVATE_KEY "$JWT_KEY"

echo "Setting JWKS..."
npx convex env set JWKS "$JWKS"

echo "Setting SITE_URL..."
npx convex env set SITE_URL "http://localhost:3000"

echo "Done! All Convex Auth env vars set."

#!/usr/bin/env bash
set -e

cd frontend
npm install
npm run build
cd ../backend
npm install
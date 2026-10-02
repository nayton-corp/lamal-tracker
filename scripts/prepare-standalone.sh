#!/bin/sh
# Complète la sortie « standalone » de Next : fichiers statiques, public et migrations.
set -e
cp -r public .next/standalone/
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/
rm -rf .next/standalone/drizzle && cp -r drizzle .next/standalone/

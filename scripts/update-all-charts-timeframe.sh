#!/bin/bash
# Script to update all remaining economic data charts with time frame selector

charts=(
  "sbp-reserves-section.tsx:monthly"
  "fdi-section.tsx:monthly"
  "m2-section.tsx:weekly"
  "deposits-section.tsx:weekly"
  "vehicle-sales-section.tsx:monthly"
  "cement-sales-section.tsx:monthly"
  "electricity-generation-section.tsx:monthly"
  "pol-sales-section.tsx:monthly"
  "scra-section.tsx:weekly"
)

echo "This script shows which charts need updating. Manual updates required."
for chart in "${charts[@]}"; do
  file="${chart%%:*}"
  freq="${chart##*:}"
  echo "- $file (frequency: $freq, default: $(if [ "$freq" = "daily" ]; then echo "1Y"; elif [ "$freq" = "weekly" ]; then echo "1Y"; elif [ "$freq" = "monthly" ]; then echo "5Y"; else echo "ALL"; fi))"
done












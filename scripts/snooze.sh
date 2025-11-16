#!/bin/bash

CONFIG_DIR="$HOME/what-did-you-get-done-this-week"
FILE="$CONFIG_DIR/$(date +%Y-%m-%d).txt"

mkdir -p "$CONFIG_DIR"

SNOOZE_TIME=$(date -d '+15 minutes' '+%Y-%m-%d %H:%M:%S')
echo "SNOOZE UNTIL $SNOOZE_TIME" >> "$FILE"
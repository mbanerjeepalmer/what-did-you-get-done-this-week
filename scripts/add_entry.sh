#!/bin/bash

CONFIG_DIR="$HOME/what-did-you-get-done-this-week"
FILE="$CONFIG_DIR/$(date +%Y-%m-%d).txt"

mkdir -p "$CONFIG_DIR"

ENTRY=$(zenity --entry --text="What did you get done?" --title="Add Entry")

if [ -n "$ENTRY" ]; then
    echo "$(date -Iseconds) - $ENTRY" >> "$FILE"
fi
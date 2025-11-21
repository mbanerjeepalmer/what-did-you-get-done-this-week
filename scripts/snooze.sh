#!/bin/bash

CONFIG_DIR="$HOME/what-did-you-get-done-this-week"
FILE="$CONFIG_DIR/$(date +%Y-%m-%d).txt"

mkdir -p "$CONFIG_DIR"

if [ "$1" = "custom" ]; then
    # Prompt for custom time
    TIME=$(zenity --entry --text="Enter snooze end time (HH:MM):" --entry-text="$(date +'%H:%M')" --title="Custom Snooze")
    if [ $? -eq 0 ] && [ -n "$TIME" ]; then
        CURRENT_TIME=$(date +%s)
        SPECIFIED_TIME=$(date -d "today $TIME" +%s)
        if [ $SPECIFIED_TIME -lt $CURRENT_TIME ]; then
            SNOOZE_TIME=$(date -d "tomorrow $TIME" '+%Y-%m-%dT%H:%M:%S%:z')
        else
            SNOOZE_TIME=$(date -d "today $TIME" '+%Y-%m-%dT%H:%M:%S%:z')
        fi
        echo "$(date -Iseconds) - SNOOZE UNTIL $SNOOZE_TIME" >> "$FILE"
    fi
elif [ $# -gt 0 ]; then
    # Snooze for $1 minutes
    SNOOZE_TIME=$(date -d "+$1 minutes" '+%Y-%m-%dT%H:%M:%S%:z')
    echo "$(date -Iseconds) - SNOOZE UNTIL $SNOOZE_TIME" >> "$FILE"
else
    # Default 15 minutes
    SNOOZE_TIME=$(date -d '+15 minutes' '+%Y-%m-%dT%H:%M:%S%:z')
    echo "$(date -Iseconds) - SNOOZE UNTIL $SNOOZE_TIME" >> "$FILE"
fi
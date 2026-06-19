#!/bin/sh
echo "{\"maintenanceMode\": ${MAINTENANCE_MODE:-false}}" \
  > /usr/share/nginx/html/assets/config.json
exec nginx -g 'daemon off;'

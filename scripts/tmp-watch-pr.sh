#!/bin/zsh
prev=""
while true; do
  s=$(gh pr checks 530 --json name,bucket 2>/dev/null || echo '[]')
  if [ "$s" = "[]" ]; then
    sleep 30
    continue
  fi
  cur=$(jq -r '.[] | select(.bucket!="pending") | "\(.name): \(.bucket)"' <<<"$s" | sort)
  comm -13 <(echo "$prev") <(echo "$cur")
  prev=$cur
  if jq -e 'length > 0 and all(.bucket!="pending")' <<<"$s" >/dev/null; then
    echo "ALL CHECKS REPORTED"
    break
  fi
  sleep 30
done

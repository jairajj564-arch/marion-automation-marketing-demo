// The DASHBOARD node returns one item per metric. Collapse back to ONE item so the AI and Telegram steps run once.
return [{ json: { dashboard_rows: $input.all().length } }];

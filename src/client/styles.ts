export const styles = `
.provider-manager {
  --pm-border: var(--dsw-alias-border-l2, color-mix(in srgb, var(--dsw-alias-label-primary, currentColor) 12%, transparent));
  --pm-fill: color-mix(in srgb, var(--dsw-alias-label-primary, currentColor) 12%, transparent);
  --pm-bar: color-mix(in srgb, var(--dsw-alias-label-primary, currentColor) 55%, var(--dsw-alias-label-secondary, currentColor));
  --pm-fg: var(--dsw-alias-label-primary, currentColor);
  --pm-muted: var(--dsw-alias-label-secondary, color-mix(in srgb, currentColor 62%, transparent));
  --pm-faint: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 48%, transparent));
  --pm-warn: var(--dsw-alias-state-warn-primary, #c48a2a);
  --pm-quota-col: minmax(170px, calc((100% - 90px) / 2.05));
  max-width: 650px;
  margin: 0 auto;
  padding: 4px 2px 16px;
  font-size: 13px;
  line-height: 1.5;
  min-width: 0;
  container-type: inline-size;
  color: var(--pm-fg);
}
.provider-manager .pm-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin: 3px 0 20px;
}
.provider-manager .pm-header h2 {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  letter-spacing: -.5px;
}
.provider-manager .pm-header p { margin: 5px 0 0; color: var(--pm-muted); font-size: 12px; }
.pm-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  border: 1px solid var(--pm-border);
  border-radius: 11px;
  padding: 14px 16px;
  margin: 0 0 16px;
  background: var(--dsw-alias-bg-module-platform, color-mix(in srgb, currentColor 4%, transparent));
}
.pm-count {
  font-size: 27px;
  line-height: 1;
  font-weight: 550;
  font-variant-numeric: tabular-nums;
  letter-spacing: -1px;
}
.pm-banner .pm-copy { flex: 1; min-width: 140px; }
.pm-banner .pm-copy strong { display: block; font-size: 13px; }
.pm-banner p { margin: 3px 0 0; color: var(--pm-muted); font-size: 11px; }
.pm-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin: 0 0 10px;
}
.pm-zone { font-size: 11px; color: var(--pm-faint); }
.pm-columns, .pm-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) var(--pm-quota-col) 72px;
  gap: 20px;
  align-items: center;
}
.pm-columns {
  padding: 0 12px 10px;
  color: var(--pm-faint);
  font-size: 10px;
  border-bottom: 1px solid var(--pm-border);
}
.provider-manager .pm-list { display: flex; flex-direction: column; margin: 0; }
.pm-row {
  position: relative;
  padding: 16px 12px;
  min-height: 88px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--pm-border);
  min-width: 0;
  overflow: hidden;
  background: transparent;
}
.pm-row:last-child { border-bottom: 0; }
.provider-manager .pm-icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 28px;
  flex: none;
}
.provider-manager .pm-icon svg { width: 22px; height: 24px; display: block; }
.pm-identity, .pm-quota { min-width: 0; }
.pm-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow-wrap: anywhere;
}
.pm-setup {
  justify-self: end;
  white-space: nowrap;
  min-height: 34px;
  padding: 6px 12px !important;
  margin: 0 !important;
  font-size: 12px;
  font-weight: 500;
  border-radius: 9px;
}
.pm-title {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin: 0;
}
.provider-manager .pm-identity h2,
.provider-manager .pm-identity h3 {
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  margin: 0;
}
.provider-manager .pm-identity p, .provider-manager .pm-quota p {
  margin: 4px 0 0;
  color: var(--pm-faint);
  font-size: 11px;
}
.pm-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 500;
  line-height: 16px;
  padding: 0 5px 0 4px;
  border-radius: 4px;
  border: 1px solid var(--pm-border);
  color: var(--pm-muted);
}
.pm-badge svg { width: 12px; height: 12px; }
.pm-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 99px;
  margin-right: 6px;
  background: var(--pm-faint);
  vertical-align: middle;
}
.pm-dot-on { background: #3b7759; }
.pm-meter-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.pm-meter-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--pm-muted);
  font-size: 12px;
}
.pm-meter-value {
  flex: none;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  font-size: 12px;
}
.pm-meter {
  display: block;
  width: 100%;
  height: 6px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--pm-fill);
  position: relative;
}
.pm-meter-fill {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--pm-bar);
  background-image: repeating-linear-gradient(
    to right,
    transparent 0,
    transparent calc(10% - 1px),
    var(--dsw-alias-bg-layer-1, #fff) calc(10% - 1px),
    var(--dsw-alias-bg-layer-1, #fff) 10%
  );
}
.pm-meter-warn .pm-meter-fill { background-color: var(--pm-warn); }
.pm-meter-detail, .pm-meter-missing {
  margin: 4px 0 0;
  color: var(--pm-faint);
  font-size: 11px;
}
.pm-quota-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.pm-quota-detail {
  border: 1px solid var(--pm-border);
  border-radius: 12px;
  padding: 16px 18px;
  margin: 12px 0;
}
.pm-quota-detail .pm-window { margin: 12px 0; }
.provider-manager .pm-card { border: 1px solid var(--pm-border); border-radius: 12px; padding: 18px; min-width: 0; margin: 12px 0; }
.provider-manager h3, .provider-manager h4 { font-size: 1.05rem; margin: 0 0 12px; }
.provider-manager label { display: block; margin-top: 12px; font-weight: 500; }
.provider-manager input,.provider-manager textarea,.provider-manager select {
  display: block;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  margin: 4px 0 10px;
  color: inherit;
  background: color-mix(in srgb, currentColor 4%, transparent);
  border: 1px solid var(--pm-border);
  border-radius: 8px;
}
.provider-manager textarea { min-height: 76px; resize: vertical; }
.provider-manager button {
  border: 1px solid var(--pm-border);
  border-radius: 9px;
  padding: 6px 12px;
  margin: 4px 8px 4px 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  min-height: 34px;
}
.provider-manager .pm-quiet {
  border-color: transparent;
  background: transparent;
  min-height: 28px;
  padding: 4px 8px;
  margin: 0;
  color: var(--pm-muted);
}
.provider-manager button:disabled { opacity: .5; cursor: default; }
.provider-manager :focus-visible { outline: 2px solid #668cff; outline-offset: 3px; }
.provider-manager [role=alert] { color: #d96950; }
.provider-manager ul { max-height: 220px; overflow: auto; padding-left: 20px; overflow-wrap: anywhere; }
.pm-page { min-width: 0; }
.pm-page-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 8px 0 16px;
}
.pm-back { white-space: nowrap; }
.pm-help { color: var(--pm-muted); font-size: 12px; }
.pm-links { display: flex; flex-direction: column; gap: 8px; margin: 16px 0; font-size: 12px; }
@media (max-width: 600px) {
  .pm-columns { display: none; }
  .pm-row {
    grid-template-columns: minmax(0,1fr) auto;
    min-height: 0;
    padding: 14px 4px;
    gap: 10px;
  }
  .pm-quota { grid-column: 1 / -1; }
  .pm-setup { grid-column: 2; grid-row: 1; }
}
@container (max-width: 540px) {
  .pm-columns { display: none; }
  .pm-row {
    grid-template-columns: minmax(0,1fr) auto;
    min-height: 0;
    padding: 14px 4px;
    gap: 10px;
  }
  .pm-quota { grid-column: 1 / -1; }
  .pm-setup { grid-column: 2; grid-row: 1; }
}
@container (max-width: 220px) {
  .pm-row { grid-template-columns: minmax(0,1fr); }
  .pm-icon, .pm-identity, .pm-quota, .pm-setup {
    grid-column: 1;
    justify-self: stretch;
  }
  .pm-setup { justify-self: start; }
}
`;

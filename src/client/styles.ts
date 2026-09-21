export const styles = `
.provider-manager {
  --pm-border: color-mix(in srgb, currentColor 22%, transparent);
  --pm-fill: color-mix(in srgb, currentColor 14%, transparent);
  --pm-bar: color-mix(in srgb, currentColor 48%, transparent);
  max-width: 1100px;
  padding: 16px;
  line-height: 1.55;
  min-width: 0;
  container-type: inline-size;
}
.provider-manager .pm-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.provider-manager .pm-list { display: flex; flex-direction: column; gap: 8px; margin: 16px 0; }
.pm-row {
  display: grid;
  grid-template-columns: 40px minmax(0,1fr) minmax(0,1.5fr) auto;
  gap: 12px;
  align-items: center;
  border: 1px solid var(--pm-border);
  border-radius: 12px;
  padding: 12px 14px;
  min-width: 0;
  overflow: hidden;
}
.provider-manager .pm-icon { display: flex; width: 40px; height: 40px; align-items: center; justify-content: center; }
.provider-manager .pm-icon svg { width: 28px; height: 28px; }
.pm-identity, .pm-quota, .pm-details { min-width: 0; }
.pm-details { display: contents; }
.pm-details > summary { grid-column: 4; grid-row: 1; justify-self: end; }
.provider-manager .pm-identity h3 { font-size: 1rem; margin: 0 0 4px; }
.provider-manager .pm-identity p, .provider-manager .pm-quota p { margin: 0 0 4px; }
.provider-manager .pm-window-main { font-weight: 600; }
.provider-manager .pm-bar {
  display: block;
  width: 100%;
  height: 8px;
  border: 0;
  border-radius: 99px;
  background: var(--pm-fill);
  accent-color: var(--pm-bar);
}
.provider-manager .pm-card { border: 1px solid var(--pm-border); border-radius: 12px; padding: 18px; min-width: 0; margin: 12px 0; }
.provider-manager h3 { font-size: 1.1rem; margin: 0 0 12px; }
.provider-manager label { display: block; margin-top: 12px; font-weight: 500; }
.provider-manager input,.provider-manager textarea,.provider-manager select { display: block; width: 100%; box-sizing: border-box; padding: 8px; margin: 4px 0 10px; color: inherit; background: transparent; border: 1px solid var(--pm-border); border-radius: 6px; }
.provider-manager textarea { min-height: 76px; resize: vertical; }
.provider-manager button, .provider-manager summary {
  border: 1px solid var(--pm-border);
  border-radius: 6px;
  padding: 7px 12px;
  margin: 4px 8px 4px 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  display: inline-block;
}
.provider-manager button:disabled { opacity: .5; cursor: default; }
.provider-manager :focus-visible { outline: 2px solid #668cff; outline-offset: 3px; }
.provider-manager [role=alert] { color: #d96950; }
.provider-manager ul { max-height: 220px; overflow: auto; padding-left: 20px; overflow-wrap: anywhere; }
.pm-details-body { grid-column: 1 / -1; margin-top: 10px; min-width: 0; overflow-wrap: anywhere; }
@media (max-width: 600px) {
  .pm-row {
    grid-template-columns: 40px minmax(0,1fr) auto;
  }
  .pm-quota { grid-column: 1 / -1; }
  .pm-details > summary { grid-column: 3; }
}
@container (max-width: 600px) {
  .pm-row {
    grid-template-columns: 40px minmax(0,1fr) auto;
  }
  .pm-quota { grid-column: 1 / -1; }
  .pm-details > summary { grid-column: 3; }
}
`;

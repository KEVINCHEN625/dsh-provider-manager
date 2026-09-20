export const styles = `
.provider-manager { max-width: 1100px; padding: 16px; line-height: 1.55; }
.provider-manager .pm-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,320px),1fr)); gap: 16px; margin: 16px 0; }
.provider-manager .pm-card { border: 1px solid #8886; border-radius: 12px; padding: 18px; min-width: 0; margin: 12px 0; }
.provider-manager h3 { font-size: 1.1rem; margin: 0 0 12px; }
.provider-manager label { display: block; margin-top: 12px; font-weight: 500; }
.provider-manager input,.provider-manager textarea,.provider-manager select { display: block; width: 100%; box-sizing: border-box; padding: 8px; margin: 4px 0 10px; color: inherit; background: transparent; border: 1px solid #8888; border-radius: 6px; }
.provider-manager textarea { min-height: 76px; resize: vertical; }
.provider-manager button { border: 1px solid #8888; border-radius: 6px; padding: 7px 12px; margin: 4px 8px 4px 0; color: inherit; background: transparent; cursor: pointer; }
.provider-manager button:disabled { opacity: .5; cursor: default; }
.provider-manager :focus-visible { outline: 2px solid #668cff; outline-offset: 3px; }
.provider-manager [role=alert] { color: #d96950; }
.provider-manager ul { max-height: 220px; overflow: auto; padding-left: 20px; overflow-wrap: anywhere; }
`;

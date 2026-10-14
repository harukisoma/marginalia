// Persisted identifiers are independent of the app release and asset version.
export const NOTEBOOK_DATABASE='marginalia-notebook-v1';
export const RECOVERY_DATABASE='marginalia-recovery-v1';
export const BACKUP_FORMAT='marginalia-yjs-v1';
export function backupStateFromText(text){const data=JSON.parse(text);if(data.format!==BACKUP_FORMAT||!Array.isArray(data.state)||data.state.some(value=>!Number.isInteger(value)||value<0||value>255))throw new Error('Marginaliaのバックアップファイルではありません。');return new Uint8Array(data.state);}

import { Tag } from './Tag.tsx';

const TONE_MAP = {
    ok: 'emerald',
    warn: 'amber',
    critical: 'rose',
} as const;

export function SeverityBadge({ severity }: { severity: string }) {
    const tone = (TONE_MAP as Record<string, 'emerald' | 'amber' | 'rose'>)[severity] ?? 'zinc';
    return <Tag tone={tone}>{severity.toUpperCase()}</Tag>;
}

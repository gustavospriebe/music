import type { GeneratedLyrics, OrderStatus, Story } from '@resenha/contracts';
export declare const orderTransitions: Readonly<Record<"draft" | "story_completed" | "lyrics_generating" | "lyrics_ready" | "lyrics_approved" | "payment_pending" | "paid" | "audio_queued" | "audio_generating" | "review_required" | "delivered" | "revision_requested" | "failed" | "refunded" | "cancelled", readonly ("draft" | "story_completed" | "lyrics_generating" | "lyrics_ready" | "lyrics_approved" | "payment_pending" | "paid" | "audio_queued" | "audio_generating" | "review_required" | "delivered" | "revision_requested" | "failed" | "refunded" | "cancelled")[]>>;
export declare const canTransition: (from: OrderStatus, to: OrderStatus) => boolean;
export declare class InvalidOrderTransitionError extends Error {
    constructor(from: OrderStatus, to: OrderStatus);
}
export declare const assertTransition: (from: OrderStatus, to: OrderStatus) => void;
export declare const basePriceCents = 4990;
export declare const calculatePriceCents: (baseCents: number, additionsCents?: readonly number[]) => number;
export declare const hashToken: (token: string, pepper: string) => string;
export declare const createAccessToken: () => string;
export declare const verifyToken: (token: string, expectedHash: string, pepper: string) => boolean;
export type ContentAssessment = {
    allowed: true;
} | {
    allowed: false;
    reason: string;
    category: ContentCategory;
};
export type ContentCategory = 'threat' | 'severe_humiliation' | 'hate' | 'criminal_accusation' | 'intimate_data' | 'sexual_content' | 'minors' | 'voice_imitation' | 'copyright' | 'impersonation';
export declare const evaluateContent: (input: string) => ContentAssessment;
export declare const validateLyrics: (lyrics: GeneratedLyrics, story: Story) => string[];
export declare const makeMusicPrompt: (lyrics: GeneratedLyrics) => string;
export declare const retryDelayMs: (attempt: number, baseDelayMs?: number, maxDelayMs?: number, random?: () => number) => number;

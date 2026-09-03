import { z } from 'zod';
export declare const productTypeSchema: z.ZodEnum<["friend_roast", "team_anthem", "emotional_tribute"]>;
export type ProductType = z.infer<typeof productTypeSchema>;
export declare const orderStatusSchema: z.ZodEnum<["draft", "story_completed", "lyrics_generating", "lyrics_ready", "lyrics_approved", "payment_pending", "paid", "audio_queued", "audio_generating", "review_required", "delivered", "revision_requested", "failed", "refunded", "cancelled"]>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export declare const storySchemaVersion = 1;
export declare const voiceSchema: z.ZodEnum<["male", "female", "duet", "either"]>;
export declare const roastLevelSchema: z.ZodEnum<["light", "medium", "strong"]>;
export declare const commonStorySchema: z.ZodObject<{
    buyerName: z.ZodOptional<z.ZodString>;
    buyerEmail: z.ZodString;
    subjectName: z.ZodString;
    pronunciation: z.ZodOptional<z.ZodString>;
    occasion: z.ZodString;
    genre: z.ZodString;
    voice: z.ZodEnum<["male", "female", "duet", "either"]>;
    mood: z.ZodString;
    facts: z.ZodArray<z.ZodString, "many">;
    catchphrases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    prohibitedTopics: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    finalMessage: z.ZodOptional<z.ZodString>;
    termsAccepted: z.ZodLiteral<true>;
    marketingAccepted: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    catchphrases: string[];
    prohibitedTopics: string[];
    termsAccepted: true;
    marketingAccepted: boolean;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    finalMessage?: string | undefined;
}, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    termsAccepted: true;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    catchphrases?: string[] | undefined;
    prohibitedTopics?: string[] | undefined;
    finalMessage?: string | undefined;
    marketingAccepted?: boolean | undefined;
}>;
export declare const friendRoastStorySchema: z.ZodObject<{
    buyerName: z.ZodOptional<z.ZodString>;
    buyerEmail: z.ZodString;
    subjectName: z.ZodString;
    pronunciation: z.ZodOptional<z.ZodString>;
    occasion: z.ZodString;
    genre: z.ZodString;
    voice: z.ZodEnum<["male", "female", "duet", "either"]>;
    mood: z.ZodString;
    facts: z.ZodArray<z.ZodString, "many">;
    catchphrases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    prohibitedTopics: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    finalMessage: z.ZodOptional<z.ZodString>;
    termsAccepted: z.ZodLiteral<true>;
    marketingAccepted: z.ZodDefault<z.ZodBoolean>;
} & {
    productType: z.ZodLiteral<"friend_roast">;
    relationship: z.ZodString;
    groupName: z.ZodOptional<z.ZodString>;
    traits: z.ZodArray<z.ZodString, "many">;
    biggestStory: z.ZodString;
    insideJokes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    mentions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    roastLevel: z.ZodEnum<["light", "medium", "strong"]>;
    safetyConfirmed: z.ZodLiteral<true>;
}, "strip", z.ZodTypeAny, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    catchphrases: string[];
    prohibitedTopics: string[];
    termsAccepted: true;
    marketingAccepted: boolean;
    productType: "friend_roast";
    relationship: string;
    traits: string[];
    biggestStory: string;
    insideJokes: string[];
    mentions: string[];
    roastLevel: "light" | "medium" | "strong";
    safetyConfirmed: true;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    finalMessage?: string | undefined;
    groupName?: string | undefined;
}, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    termsAccepted: true;
    productType: "friend_roast";
    relationship: string;
    traits: string[];
    biggestStory: string;
    roastLevel: "light" | "medium" | "strong";
    safetyConfirmed: true;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    catchphrases?: string[] | undefined;
    prohibitedTopics?: string[] | undefined;
    finalMessage?: string | undefined;
    marketingAccepted?: boolean | undefined;
    groupName?: string | undefined;
    insideJokes?: string[] | undefined;
    mentions?: string[] | undefined;
}>;
export declare const teamAnthemStorySchema: z.ZodObject<{
    buyerName: z.ZodOptional<z.ZodString>;
    buyerEmail: z.ZodString;
    subjectName: z.ZodString;
    pronunciation: z.ZodOptional<z.ZodString>;
    occasion: z.ZodString;
    genre: z.ZodString;
    voice: z.ZodEnum<["male", "female", "duet", "either"]>;
    mood: z.ZodString;
    facts: z.ZodArray<z.ZodString, "many">;
    catchphrases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    prohibitedTopics: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    finalMessage: z.ZodOptional<z.ZodString>;
    termsAccepted: z.ZodLiteral<true>;
    marketingAccepted: z.ZodDefault<z.ZodBoolean>;
} & {
    productType: z.ZodLiteral<"team_anthem">;
    location: z.ZodString;
    colors: z.ZodString;
    players: z.ZodArray<z.ZodString, "many">;
    greatestWin: z.ZodString;
    biggestLoss: z.ZodString;
    rival: z.ZodOptional<z.ZodString>;
    chant: z.ZodOptional<z.ZodString>;
    anthemStyle: z.ZodEnum<["epic", "pagode", "funk", "rock", "samba"]>;
    amateurConfirmed: z.ZodLiteral<true>;
}, "strip", z.ZodTypeAny, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    catchphrases: string[];
    prohibitedTopics: string[];
    termsAccepted: true;
    marketingAccepted: boolean;
    productType: "team_anthem";
    location: string;
    colors: string;
    players: string[];
    greatestWin: string;
    biggestLoss: string;
    anthemStyle: "epic" | "pagode" | "funk" | "rock" | "samba";
    amateurConfirmed: true;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    finalMessage?: string | undefined;
    rival?: string | undefined;
    chant?: string | undefined;
}, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    termsAccepted: true;
    productType: "team_anthem";
    location: string;
    colors: string;
    players: string[];
    greatestWin: string;
    biggestLoss: string;
    anthemStyle: "epic" | "pagode" | "funk" | "rock" | "samba";
    amateurConfirmed: true;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    catchphrases?: string[] | undefined;
    prohibitedTopics?: string[] | undefined;
    finalMessage?: string | undefined;
    marketingAccepted?: boolean | undefined;
    rival?: string | undefined;
    chant?: string | undefined;
}>;
export declare const emotionalTributeStorySchema: z.ZodObject<{
    buyerName: z.ZodOptional<z.ZodString>;
    buyerEmail: z.ZodString;
    subjectName: z.ZodString;
    pronunciation: z.ZodOptional<z.ZodString>;
    occasion: z.ZodString;
    genre: z.ZodString;
    voice: z.ZodEnum<["male", "female", "duet", "either"]>;
    mood: z.ZodString;
    facts: z.ZodArray<z.ZodString, "many">;
    catchphrases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    prohibitedTopics: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    finalMessage: z.ZodOptional<z.ZodString>;
    termsAccepted: z.ZodLiteral<true>;
    marketingAccepted: z.ZodDefault<z.ZodBoolean>;
} & {
    productType: z.ZodLiteral<"emotional_tribute">;
    relationship: z.ZodString;
    howMet: z.ZodString;
    mostImportantMemory: z.ZodString;
    gratitudeReason: z.ZodString;
    milestone: z.ZodString;
    desiredFeeling: z.ZodString;
}, "strip", z.ZodTypeAny, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    catchphrases: string[];
    prohibitedTopics: string[];
    termsAccepted: true;
    marketingAccepted: boolean;
    productType: "emotional_tribute";
    relationship: string;
    howMet: string;
    mostImportantMemory: string;
    gratitudeReason: string;
    milestone: string;
    desiredFeeling: string;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    finalMessage?: string | undefined;
}, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    termsAccepted: true;
    productType: "emotional_tribute";
    relationship: string;
    howMet: string;
    mostImportantMemory: string;
    gratitudeReason: string;
    milestone: string;
    desiredFeeling: string;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    catchphrases?: string[] | undefined;
    prohibitedTopics?: string[] | undefined;
    finalMessage?: string | undefined;
    marketingAccepted?: boolean | undefined;
}>;
export declare const storySchema: z.ZodDiscriminatedUnion<"productType", [z.ZodObject<{
    buyerName: z.ZodOptional<z.ZodString>;
    buyerEmail: z.ZodString;
    subjectName: z.ZodString;
    pronunciation: z.ZodOptional<z.ZodString>;
    occasion: z.ZodString;
    genre: z.ZodString;
    voice: z.ZodEnum<["male", "female", "duet", "either"]>;
    mood: z.ZodString;
    facts: z.ZodArray<z.ZodString, "many">;
    catchphrases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    prohibitedTopics: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    finalMessage: z.ZodOptional<z.ZodString>;
    termsAccepted: z.ZodLiteral<true>;
    marketingAccepted: z.ZodDefault<z.ZodBoolean>;
} & {
    productType: z.ZodLiteral<"friend_roast">;
    relationship: z.ZodString;
    groupName: z.ZodOptional<z.ZodString>;
    traits: z.ZodArray<z.ZodString, "many">;
    biggestStory: z.ZodString;
    insideJokes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    mentions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    roastLevel: z.ZodEnum<["light", "medium", "strong"]>;
    safetyConfirmed: z.ZodLiteral<true>;
}, "strip", z.ZodTypeAny, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    catchphrases: string[];
    prohibitedTopics: string[];
    termsAccepted: true;
    marketingAccepted: boolean;
    productType: "friend_roast";
    relationship: string;
    traits: string[];
    biggestStory: string;
    insideJokes: string[];
    mentions: string[];
    roastLevel: "light" | "medium" | "strong";
    safetyConfirmed: true;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    finalMessage?: string | undefined;
    groupName?: string | undefined;
}, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    termsAccepted: true;
    productType: "friend_roast";
    relationship: string;
    traits: string[];
    biggestStory: string;
    roastLevel: "light" | "medium" | "strong";
    safetyConfirmed: true;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    catchphrases?: string[] | undefined;
    prohibitedTopics?: string[] | undefined;
    finalMessage?: string | undefined;
    marketingAccepted?: boolean | undefined;
    groupName?: string | undefined;
    insideJokes?: string[] | undefined;
    mentions?: string[] | undefined;
}>, z.ZodObject<{
    buyerName: z.ZodOptional<z.ZodString>;
    buyerEmail: z.ZodString;
    subjectName: z.ZodString;
    pronunciation: z.ZodOptional<z.ZodString>;
    occasion: z.ZodString;
    genre: z.ZodString;
    voice: z.ZodEnum<["male", "female", "duet", "either"]>;
    mood: z.ZodString;
    facts: z.ZodArray<z.ZodString, "many">;
    catchphrases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    prohibitedTopics: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    finalMessage: z.ZodOptional<z.ZodString>;
    termsAccepted: z.ZodLiteral<true>;
    marketingAccepted: z.ZodDefault<z.ZodBoolean>;
} & {
    productType: z.ZodLiteral<"team_anthem">;
    location: z.ZodString;
    colors: z.ZodString;
    players: z.ZodArray<z.ZodString, "many">;
    greatestWin: z.ZodString;
    biggestLoss: z.ZodString;
    rival: z.ZodOptional<z.ZodString>;
    chant: z.ZodOptional<z.ZodString>;
    anthemStyle: z.ZodEnum<["epic", "pagode", "funk", "rock", "samba"]>;
    amateurConfirmed: z.ZodLiteral<true>;
}, "strip", z.ZodTypeAny, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    catchphrases: string[];
    prohibitedTopics: string[];
    termsAccepted: true;
    marketingAccepted: boolean;
    productType: "team_anthem";
    location: string;
    colors: string;
    players: string[];
    greatestWin: string;
    biggestLoss: string;
    anthemStyle: "epic" | "pagode" | "funk" | "rock" | "samba";
    amateurConfirmed: true;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    finalMessage?: string | undefined;
    rival?: string | undefined;
    chant?: string | undefined;
}, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    termsAccepted: true;
    productType: "team_anthem";
    location: string;
    colors: string;
    players: string[];
    greatestWin: string;
    biggestLoss: string;
    anthemStyle: "epic" | "pagode" | "funk" | "rock" | "samba";
    amateurConfirmed: true;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    catchphrases?: string[] | undefined;
    prohibitedTopics?: string[] | undefined;
    finalMessage?: string | undefined;
    marketingAccepted?: boolean | undefined;
    rival?: string | undefined;
    chant?: string | undefined;
}>, z.ZodObject<{
    buyerName: z.ZodOptional<z.ZodString>;
    buyerEmail: z.ZodString;
    subjectName: z.ZodString;
    pronunciation: z.ZodOptional<z.ZodString>;
    occasion: z.ZodString;
    genre: z.ZodString;
    voice: z.ZodEnum<["male", "female", "duet", "either"]>;
    mood: z.ZodString;
    facts: z.ZodArray<z.ZodString, "many">;
    catchphrases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    prohibitedTopics: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    finalMessage: z.ZodOptional<z.ZodString>;
    termsAccepted: z.ZodLiteral<true>;
    marketingAccepted: z.ZodDefault<z.ZodBoolean>;
} & {
    productType: z.ZodLiteral<"emotional_tribute">;
    relationship: z.ZodString;
    howMet: z.ZodString;
    mostImportantMemory: z.ZodString;
    gratitudeReason: z.ZodString;
    milestone: z.ZodString;
    desiredFeeling: z.ZodString;
}, "strip", z.ZodTypeAny, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    catchphrases: string[];
    prohibitedTopics: string[];
    termsAccepted: true;
    marketingAccepted: boolean;
    productType: "emotional_tribute";
    relationship: string;
    howMet: string;
    mostImportantMemory: string;
    gratitudeReason: string;
    milestone: string;
    desiredFeeling: string;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    finalMessage?: string | undefined;
}, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    termsAccepted: true;
    productType: "emotional_tribute";
    relationship: string;
    howMet: string;
    mostImportantMemory: string;
    gratitudeReason: string;
    milestone: string;
    desiredFeeling: string;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    catchphrases?: string[] | undefined;
    prohibitedTopics?: string[] | undefined;
    finalMessage?: string | undefined;
    marketingAccepted?: boolean | undefined;
}>]>;
export type Story = z.infer<typeof storySchema>;
export declare const lyricsSectionSchema: z.ZodObject<{
    type: z.ZodEnum<["intro", "verse", "pre_chorus", "chorus", "bridge", "outro"]>;
    label: z.ZodString;
    lyrics: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "intro" | "verse" | "pre_chorus" | "chorus" | "bridge" | "outro";
    label: string;
    lyrics: string;
}, {
    type: "intro" | "verse" | "pre_chorus" | "chorus" | "bridge" | "outro";
    label: string;
    lyrics: string;
}>;
export declare const generatedLyricsSchema: z.ZodObject<{
    title: z.ZodString;
    summary: z.ZodString;
    language: z.ZodLiteral<"pt-BR">;
    musicalDirection: z.ZodObject<{
        genre: z.ZodString;
        mood: z.ZodString;
        tempo: z.ZodEnum<["slow", "medium", "fast"]>;
        voice: z.ZodEnum<["male", "female", "duet", "either"]>;
        instrumentation: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        genre: string;
        voice: "male" | "female" | "duet" | "either";
        mood: string;
        tempo: "medium" | "slow" | "fast";
        instrumentation: string[];
    }, {
        genre: string;
        voice: "male" | "female" | "duet" | "either";
        mood: string;
        tempo: "medium" | "slow" | "fast";
        instrumentation: string[];
    }>;
    pronunciationNotes: z.ZodArray<z.ZodObject<{
        term: z.ZodString;
        pronunciation: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        pronunciation: string;
        term: string;
    }, {
        pronunciation: string;
        term: string;
    }>, "many">;
    sections: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["intro", "verse", "pre_chorus", "chorus", "bridge", "outro"]>;
        label: z.ZodString;
        lyrics: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "intro" | "verse" | "pre_chorus" | "chorus" | "bridge" | "outro";
        label: string;
        lyrics: string;
    }, {
        type: "intro" | "verse" | "pre_chorus" | "chorus" | "bridge" | "outro";
        label: string;
        lyrics: string;
    }>, "many">;
    fullLyrics: z.ZodString;
    safetyNotes: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    title: string;
    summary: string;
    language: "pt-BR";
    musicalDirection: {
        genre: string;
        voice: "male" | "female" | "duet" | "either";
        mood: string;
        tempo: "medium" | "slow" | "fast";
        instrumentation: string[];
    };
    pronunciationNotes: {
        pronunciation: string;
        term: string;
    }[];
    sections: {
        type: "intro" | "verse" | "pre_chorus" | "chorus" | "bridge" | "outro";
        label: string;
        lyrics: string;
    }[];
    fullLyrics: string;
    safetyNotes: string[];
}, {
    title: string;
    summary: string;
    language: "pt-BR";
    musicalDirection: {
        genre: string;
        voice: "male" | "female" | "duet" | "either";
        mood: string;
        tempo: "medium" | "slow" | "fast";
        instrumentation: string[];
    };
    pronunciationNotes: {
        pronunciation: string;
        term: string;
    }[];
    sections: {
        type: "intro" | "verse" | "pre_chorus" | "chorus" | "bridge" | "outro";
        label: string;
        lyrics: string;
    }[];
    fullLyrics: string;
    safetyNotes: string[];
}>;
export type GeneratedLyrics = z.infer<typeof generatedLyricsSchema>;
export declare const publicIdSchema: z.ZodString;
export declare const uuidSchema: z.ZodString;
export declare const createOrderSchema: z.ZodObject<{
    productType: z.ZodEnum<["friend_roast", "team_anthem", "emotional_tribute"]>;
}, "strip", z.ZodTypeAny, {
    productType: "friend_roast" | "team_anthem" | "emotional_tribute";
}, {
    productType: "friend_roast" | "team_anthem" | "emotional_tribute";
}>;
export declare const updateStorySchema: z.ZodDiscriminatedUnion<"productType", [z.ZodObject<{
    buyerName: z.ZodOptional<z.ZodString>;
    buyerEmail: z.ZodString;
    subjectName: z.ZodString;
    pronunciation: z.ZodOptional<z.ZodString>;
    occasion: z.ZodString;
    genre: z.ZodString;
    voice: z.ZodEnum<["male", "female", "duet", "either"]>;
    mood: z.ZodString;
    facts: z.ZodArray<z.ZodString, "many">;
    catchphrases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    prohibitedTopics: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    finalMessage: z.ZodOptional<z.ZodString>;
    termsAccepted: z.ZodLiteral<true>;
    marketingAccepted: z.ZodDefault<z.ZodBoolean>;
} & {
    productType: z.ZodLiteral<"friend_roast">;
    relationship: z.ZodString;
    groupName: z.ZodOptional<z.ZodString>;
    traits: z.ZodArray<z.ZodString, "many">;
    biggestStory: z.ZodString;
    insideJokes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    mentions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    roastLevel: z.ZodEnum<["light", "medium", "strong"]>;
    safetyConfirmed: z.ZodLiteral<true>;
}, "strip", z.ZodTypeAny, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    catchphrases: string[];
    prohibitedTopics: string[];
    termsAccepted: true;
    marketingAccepted: boolean;
    productType: "friend_roast";
    relationship: string;
    traits: string[];
    biggestStory: string;
    insideJokes: string[];
    mentions: string[];
    roastLevel: "light" | "medium" | "strong";
    safetyConfirmed: true;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    finalMessage?: string | undefined;
    groupName?: string | undefined;
}, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    termsAccepted: true;
    productType: "friend_roast";
    relationship: string;
    traits: string[];
    biggestStory: string;
    roastLevel: "light" | "medium" | "strong";
    safetyConfirmed: true;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    catchphrases?: string[] | undefined;
    prohibitedTopics?: string[] | undefined;
    finalMessage?: string | undefined;
    marketingAccepted?: boolean | undefined;
    groupName?: string | undefined;
    insideJokes?: string[] | undefined;
    mentions?: string[] | undefined;
}>, z.ZodObject<{
    buyerName: z.ZodOptional<z.ZodString>;
    buyerEmail: z.ZodString;
    subjectName: z.ZodString;
    pronunciation: z.ZodOptional<z.ZodString>;
    occasion: z.ZodString;
    genre: z.ZodString;
    voice: z.ZodEnum<["male", "female", "duet", "either"]>;
    mood: z.ZodString;
    facts: z.ZodArray<z.ZodString, "many">;
    catchphrases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    prohibitedTopics: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    finalMessage: z.ZodOptional<z.ZodString>;
    termsAccepted: z.ZodLiteral<true>;
    marketingAccepted: z.ZodDefault<z.ZodBoolean>;
} & {
    productType: z.ZodLiteral<"team_anthem">;
    location: z.ZodString;
    colors: z.ZodString;
    players: z.ZodArray<z.ZodString, "many">;
    greatestWin: z.ZodString;
    biggestLoss: z.ZodString;
    rival: z.ZodOptional<z.ZodString>;
    chant: z.ZodOptional<z.ZodString>;
    anthemStyle: z.ZodEnum<["epic", "pagode", "funk", "rock", "samba"]>;
    amateurConfirmed: z.ZodLiteral<true>;
}, "strip", z.ZodTypeAny, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    catchphrases: string[];
    prohibitedTopics: string[];
    termsAccepted: true;
    marketingAccepted: boolean;
    productType: "team_anthem";
    location: string;
    colors: string;
    players: string[];
    greatestWin: string;
    biggestLoss: string;
    anthemStyle: "epic" | "pagode" | "funk" | "rock" | "samba";
    amateurConfirmed: true;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    finalMessage?: string | undefined;
    rival?: string | undefined;
    chant?: string | undefined;
}, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    termsAccepted: true;
    productType: "team_anthem";
    location: string;
    colors: string;
    players: string[];
    greatestWin: string;
    biggestLoss: string;
    anthemStyle: "epic" | "pagode" | "funk" | "rock" | "samba";
    amateurConfirmed: true;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    catchphrases?: string[] | undefined;
    prohibitedTopics?: string[] | undefined;
    finalMessage?: string | undefined;
    marketingAccepted?: boolean | undefined;
    rival?: string | undefined;
    chant?: string | undefined;
}>, z.ZodObject<{
    buyerName: z.ZodOptional<z.ZodString>;
    buyerEmail: z.ZodString;
    subjectName: z.ZodString;
    pronunciation: z.ZodOptional<z.ZodString>;
    occasion: z.ZodString;
    genre: z.ZodString;
    voice: z.ZodEnum<["male", "female", "duet", "either"]>;
    mood: z.ZodString;
    facts: z.ZodArray<z.ZodString, "many">;
    catchphrases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    prohibitedTopics: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    finalMessage: z.ZodOptional<z.ZodString>;
    termsAccepted: z.ZodLiteral<true>;
    marketingAccepted: z.ZodDefault<z.ZodBoolean>;
} & {
    productType: z.ZodLiteral<"emotional_tribute">;
    relationship: z.ZodString;
    howMet: z.ZodString;
    mostImportantMemory: z.ZodString;
    gratitudeReason: z.ZodString;
    milestone: z.ZodString;
    desiredFeeling: z.ZodString;
}, "strip", z.ZodTypeAny, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    catchphrases: string[];
    prohibitedTopics: string[];
    termsAccepted: true;
    marketingAccepted: boolean;
    productType: "emotional_tribute";
    relationship: string;
    howMet: string;
    mostImportantMemory: string;
    gratitudeReason: string;
    milestone: string;
    desiredFeeling: string;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    finalMessage?: string | undefined;
}, {
    buyerEmail: string;
    subjectName: string;
    occasion: string;
    genre: string;
    voice: "male" | "female" | "duet" | "either";
    mood: string;
    facts: string[];
    termsAccepted: true;
    productType: "emotional_tribute";
    relationship: string;
    howMet: string;
    mostImportantMemory: string;
    gratitudeReason: string;
    milestone: string;
    desiredFeeling: string;
    buyerName?: string | undefined;
    pronunciation?: string | undefined;
    catchphrases?: string[] | undefined;
    prohibitedTopics?: string[] | undefined;
    finalMessage?: string | undefined;
    marketingAccepted?: boolean | undefined;
}>]>;
export declare const editLyricsSchema: z.ZodObject<{
    title: z.ZodString;
    summary: z.ZodString;
    language: z.ZodLiteral<"pt-BR">;
    musicalDirection: z.ZodObject<{
        genre: z.ZodString;
        mood: z.ZodString;
        tempo: z.ZodEnum<["slow", "medium", "fast"]>;
        voice: z.ZodEnum<["male", "female", "duet", "either"]>;
        instrumentation: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        genre: string;
        voice: "male" | "female" | "duet" | "either";
        mood: string;
        tempo: "medium" | "slow" | "fast";
        instrumentation: string[];
    }, {
        genre: string;
        voice: "male" | "female" | "duet" | "either";
        mood: string;
        tempo: "medium" | "slow" | "fast";
        instrumentation: string[];
    }>;
    pronunciationNotes: z.ZodArray<z.ZodObject<{
        term: z.ZodString;
        pronunciation: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        pronunciation: string;
        term: string;
    }, {
        pronunciation: string;
        term: string;
    }>, "many">;
    sections: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["intro", "verse", "pre_chorus", "chorus", "bridge", "outro"]>;
        label: z.ZodString;
        lyrics: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "intro" | "verse" | "pre_chorus" | "chorus" | "bridge" | "outro";
        label: string;
        lyrics: string;
    }, {
        type: "intro" | "verse" | "pre_chorus" | "chorus" | "bridge" | "outro";
        label: string;
        lyrics: string;
    }>, "many">;
    fullLyrics: z.ZodString;
    safetyNotes: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    title: string;
    summary: string;
    language: "pt-BR";
    musicalDirection: {
        genre: string;
        voice: "male" | "female" | "duet" | "either";
        mood: string;
        tempo: "medium" | "slow" | "fast";
        instrumentation: string[];
    };
    pronunciationNotes: {
        pronunciation: string;
        term: string;
    }[];
    sections: {
        type: "intro" | "verse" | "pre_chorus" | "chorus" | "bridge" | "outro";
        label: string;
        lyrics: string;
    }[];
    fullLyrics: string;
    safetyNotes: string[];
}, {
    title: string;
    summary: string;
    language: "pt-BR";
    musicalDirection: {
        genre: string;
        voice: "male" | "female" | "duet" | "either";
        mood: string;
        tempo: "medium" | "slow" | "fast";
        instrumentation: string[];
    };
    pronunciationNotes: {
        pronunciation: string;
        term: string;
    }[];
    sections: {
        type: "intro" | "verse" | "pre_chorus" | "chorus" | "bridge" | "outro";
        label: string;
        lyrics: string;
    }[];
    fullLyrics: string;
    safetyNotes: string[];
}>;
export declare const approveLyricsSchema: z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>;
export declare const checkoutSchema: z.ZodObject<{
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    idempotencyKey?: string | undefined;
}, {
    idempotencyKey?: string | undefined;
}>;
export declare const accessExchangeSchema: z.ZodObject<{
    token: z.ZodString;
}, "strip", z.ZodTypeAny, {
    token: string;
}, {
    token: string;
}>;
export declare const revisionRequestSchema: z.ZodObject<{
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
}, {
    message: string;
}>;
export declare const paginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
export declare const adminLoginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const apiErrorSchema: z.ZodObject<{
    error: z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        requestId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        requestId?: string | undefined;
    }, {
        code: string;
        message: string;
        requestId?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    error: {
        code: string;
        message: string;
        requestId?: string | undefined;
    };
}, {
    error: {
        code: string;
        message: string;
        requestId?: string | undefined;
    };
}>;

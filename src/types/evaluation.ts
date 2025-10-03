/**
 * TypeScript interfaces for evaluation payloads
 * 
 * These interfaces define the structure of data stored in JobArtifact.payload_json
 * for each stage of the evaluation pipeline.
 */

// Stage S1: CV Evaluation payload
export interface CVEvaluationPayload {
    parameters: {
        technical_skills: number;
        experience_level: number;
        relevant_achievements: number;
        cultural_fit: number;
    };
    weighted_average_1_to_5: number;
    cv_match_rate: number;
    cv_feedback: string;
}

// Stage S2: Project Evaluation payload
export interface ProjectEvaluationPayload {
    parameters: {
        correctness: number;
        code_quality: number;
        resilience: number;
        documentation: number;
        creativity: number;
    };
    project_score: number;
    project_feedback: string;
}

// Stage S3: Final Synthesis payload
export interface FinalSynthesisPayload {
    overall_summary: string;
}

// Union type for all evaluation payloads
export type EvaluationPayload =
    | CVEvaluationPayload
    | ProjectEvaluationPayload
    | FinalSynthesisPayload;

// Final result structure returned to users
export interface EvaluationResult {
    cv_match_rate: number;
    cv_feedback: string;
    project_score: number;
    project_feedback: string;
    overall_summary: string;
}

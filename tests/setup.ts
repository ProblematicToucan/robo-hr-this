import { config } from 'dotenv';
import { beforeAll } from 'vitest';

// Load test environment variables
config({ path: '.env.test' });

// Set up test environment
beforeAll(() => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.OPENAI_API_KEY = 'test_key_12345';
    process.env.EMBEDDING_MODEL = 'text-embedding-3-small';
    process.env.LLM_MODEL = 'gpt-4o-mini';
    process.env.LLM_TEMPERATURE = '0.1';
    process.env.STORAGE_DIR = './test-storage';
    process.env.LOG_LEVEL = 'error';
});

// Global test utilities
declare global {
    var testUtils: {
        generateMockEmbedding: (dimension?: number) => number[];
        generateMockLLMResponse: (type: 'cv' | 'project' | 'synthesis') => any;
        generateMockPDFContent: () => string;
        generateMockProjectReport: () => string;
    };
}

globalThis.testUtils = {
    generateMockEmbedding: (dimension: number = 1536) =>
        Array.from({ length: dimension }, () => Math.random() * 2 - 1),

    generateMockLLMResponse: (type: 'cv' | 'project' | 'synthesis') => {
        switch (type) {
            case 'cv':
                return {
                    parameters: {
                        technical_skills: 4,
                        experience_level: 4,
                        relevant_achievements: 3,
                        cultural_fit: 4
                    },
                    weighted_average_1_to_5: 3.75,
                    cv_match_rate: 0.75,
                    cv_feedback: "Strong technical background with relevant experience."
                };
            case 'project':
                return {
                    parameters: {
                        correctness: 4,
                        code_quality: 4,
                        resilience: 3,
                        documentation: 3,
                        creativity: 4
                    },
                    project_score: 3.6,
                    project_feedback: "Well-implemented project with good code quality."
                };
            case 'synthesis':
                return {
                    overall_summary: "Strong candidate with excellent technical skills and good project implementation. Recommended for hire."
                };
            default:
                return {};
        }
    },

    generateMockPDFContent: () => `
    John Doe
    Software Engineer
    
    Experience:
    - 5 years of backend development
    - Expertise in Node.js, TypeScript, PostgreSQL
    - Led multiple successful projects
    
    Skills:
    - Backend Development
    - Database Design
    - API Development
    - Team Leadership
  `,

    generateMockProjectReport: () => `
    Project Implementation Report
    
    Architecture:
    - Microservices architecture
    - RESTful API design
    - Database optimization
    
    Implementation:
    - Clean code practices
    - Error handling
    - Testing coverage
    
    Documentation:
    - API documentation
    - Setup instructions
    - Deployment guide
  `
};

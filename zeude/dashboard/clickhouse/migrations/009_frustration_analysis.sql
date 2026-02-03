-- Frustration Analysis View (replaces timing-based retry_density)
-- Detects user frustration/retry signals via keyword patterns in prompts
-- More accurate than previous heuristic which confused normal multi-turn interactions with retries
--
-- Uses ai_prompts table which contains actual prompt text (not redacted like claude_code_logs)

DROP VIEW IF EXISTS frustration_analysis;

CREATE VIEW IF NOT EXISTS frustration_analysis AS
SELECT
    user_id,
    session_id,
    toDate(timestamp) as date,
    count() as total_requests,
    sum(frustration_weight) as frustration_score,
    if(count() > 0, sum(frustration_weight) / count(), 0) as frustration_density
FROM (
    SELECT
        user_id,
        session_id,
        timestamp,
        prompt_text,
        prompt_length,
        CASE
            -- FILTER: Long prompts are likely new tasks, not complaints
            WHEN prompt_length > 150 THEN 0.0

            -- FILTER: Explicit new task signals
            WHEN match(lower(prompt_text), '(create|generate|make|build|write|implement)')
            THEN 0.0

            -- HIGH CONFIDENCE (1.0): Direct negation at START of prompt
            -- Korean: "아니", "아냐", "잠깐", "틀렸", "잘못"
            -- English: "no", "wrong", "wait", "stop", "actually"
            WHEN match(prompt_text, '^(아니|아냐|잠깐|잠만|틀렸|잘못|그게 아니)')
                 OR match(lower(prompt_text), '^(no[, ]|nope|wrong|wait|stop|actually|incorrect)')
            THEN 1.0

            -- MEDIUM-HIGH CONFIDENCE (0.8): Repetition/persistence signals
            -- Korean: "다시", "여전히", "또", "계속"
            -- English: "again", "still", "retry", "redo"
            WHEN match(prompt_text, '(다시 해|다시해|여전히|또 |계속 안|재시도)')
                 OR match(lower(prompt_text), '(try again|do.?again|still (not|doesn|fail)|retry|redo)')
            THEN 0.8

            -- MEDIUM CONFIDENCE (0.6): Error/fix signals in SHORT prompts only
            WHEN prompt_length < 60 AND (
                match(prompt_text, '(안돼|안되|에러|오류|고쳐|수정해|실패|버그)')
                OR match(lower(prompt_text), '(error|fail|fix|broken|bug|doesn.t work)')
            )
            THEN 0.6

            -- LOW CONFIDENCE (0.4): Questioning/confusion signals
            WHEN prompt_length < 80 AND match(prompt_text, '(왜 안|뭐가 문제|이상한데|뭐지)')
            THEN 0.4

            ELSE 0.0
        END as frustration_weight
    FROM ai_prompts
    WHERE prompt_text != ''
      AND length(prompt_text) < 2000
)
WHERE user_id != ''
GROUP BY user_id, session_id, date;

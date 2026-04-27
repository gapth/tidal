ALTER TABLE public.sessions
  ADD COLUMN llm_calls         integer NOT NULL DEFAULT 0,
  ADD COLUMN llm_input_tokens  bigint  NOT NULL DEFAULT 0,
  ADD COLUMN llm_output_tokens bigint  NOT NULL DEFAULT 0,
  ADD COLUMN embedding_calls   integer NOT NULL DEFAULT 0,
  ADD COLUMN embedding_tokens  bigint  NOT NULL DEFAULT 0,
  ADD COLUMN yt_quota_units    integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_session_usage(
    p_session_id        uuid,
    p_llm_calls         int,
    p_llm_input_tokens  bigint,
    p_llm_output_tokens bigint,
    p_embedding_calls   int,
    p_embedding_tokens  bigint,
    p_yt_quota_units    int DEFAULT 0
) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
    UPDATE public.sessions
    SET
        llm_calls         = llm_calls         + p_llm_calls,
        llm_input_tokens  = llm_input_tokens  + p_llm_input_tokens,
        llm_output_tokens = llm_output_tokens + p_llm_output_tokens,
        embedding_calls   = embedding_calls   + p_embedding_calls,
        embedding_tokens  = embedding_tokens  + p_embedding_tokens,
        yt_quota_units    = yt_quota_units    + p_yt_quota_units
    WHERE id = p_session_id;
$$;

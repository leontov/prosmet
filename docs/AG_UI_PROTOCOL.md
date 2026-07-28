# AG-UI protocol contract

Endpoint: `POST /api/agent`.

Implemented events: `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`, `STEP_STARTED`, `STEP_FINISHED`, `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`, `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`, `TOOL_CALL_RESULT`, `STATE_SNAPSHOT`, `STATE_DELTA`, `ACTIVITY_SNAPSHOT`, `ACTIVITY_DELTA`.

The server never emits reasoning or chain-of-thought. `ACTIVITY_*` carries a safe professional work trace. Cancellation is propagated through the request `AbortSignal`.

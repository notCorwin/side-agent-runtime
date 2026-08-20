# Side Agent Runtime

This context defines the three architectural seams that connect model requests to Chrome and to the Side Panel lifecycle.

## Language

**Chrome command**:
A structured request from the model to inspect or operate the current Chrome context.
_Avoid_: browser command, Chrome action

**Chrome-tool metadata**:
Provider-scoped display information that identifies a Chrome command without becoming part of the next model request.
_Avoid_: tool arguments, model context

**Side Panel run lifetime**:
The period during which a Side Panel owns an active runtime and its Chrome bridge, ending when the panel is hidden or unmounted.
_Avoid_: persisted session, reconnectable run

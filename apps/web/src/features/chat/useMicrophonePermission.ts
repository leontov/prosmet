import { useCallback, useEffect, useState } from "react";

export type MicrophonePermissionState = "prompt" | "granted" | "denied" | "unsupported";

function supportsMicrophoneCapture() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function useMicrophonePermission() {
  const [state, setState] = useState<MicrophonePermissionState>(() =>
    supportsMicrophoneCapture() ? "prompt" : "unsupported"
  );

  useEffect(() => {
    if (!supportsMicrophoneCapture() || !navigator.permissions?.query) return;
    let active = true;
    let permission: PermissionStatus | null = null;

    void navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((result) => {
        if (!active) return;
        permission = result;
        const update = () => {
          if (active) setState(result.state === "granted" ? "granted" : result.state === "denied" ? "denied" : "prompt");
        };
        update();
        result.addEventListener("change", update);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      permission?.removeEventListener("change", () => undefined);
    };
  }, []);

  const request = useCallback(async () => {
    if (!supportsMicrophoneCapture()) {
      setState("unsupported");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
      setState("granted");
      return true;
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "prompt");
      return false;
    }
  }, []);

  return { state, request };
}

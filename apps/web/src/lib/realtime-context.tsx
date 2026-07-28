"use client";

import { useAuth } from "@clerk/nextjs";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const RealtimeContext = createContext<Socket | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, getToken } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);

  // getToken isn't guaranteed referentially stable across renders — keep it in a ref so the
  // connect effect only re-runs on sign-in state changes, not on every render.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (!isSignedIn) {
      setSocket(null);
      return;
    }

    const instance = io(API_BASE_URL, {
      // Called before every (re)connection attempt, so a token that expired mid-session gets
      // refreshed automatically rather than reusing a stale one from first connect.
      auth: (cb) => {
        getTokenRef.current().then((token) => cb({ token }));
      },
    });

    setSocket(instance);

    return () => {
      instance.disconnect();
      setSocket(null);
    };
  }, [isSignedIn]);

  return <RealtimeContext.Provider value={socket}>{children}</RealtimeContext.Provider>;
}

/** Returns the shared socket, or null before sign-in / before the connection is established. */
export function useRealtimeSocket(): Socket | null {
  return useContext(RealtimeContext);
}

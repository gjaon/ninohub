import { useEffect, useRef, useState } from "react";
import { getWaitlistCount, getWaitlistEntries } from "../services/waitlist";
import { initializeSocket } from "../services/socket";

const WAITLIST_COUNT_EVENT = "waitlist:count:updated";

const toValidCount = (value) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
};

const getCountFromPayload = (payload) => {
  return (
    toValidCount(payload?.count) ??
    toValidCount(payload?.data?.count) ??
    toValidCount(payload?.data?.length)
  );
};

const useWaitlistCount = (enabled = true) => {
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const hasAnimatedInitialCount = useRef(false);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const animateToCount = (targetCount) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (targetCount <= 0) {
        setCount(0);
        return;
      }

      const duration = 1200;
      const start = performance.now();

      setCount(1);

      const tick = (timestamp) => {
        if (!isMounted) return;

        const progress = Math.min((timestamp - start) / duration, 1);
        const nextValue = Math.floor(1 + (targetCount - 1) * progress);
        setCount(nextValue);

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(tick);
        } else {
          setCount(targetCount);
        }
      };

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    const applyCount = (nextCount, shouldAnimateInitial = false) => {
      if (nextCount === null || nextCount === undefined) return;

      if (shouldAnimateInitial && !hasAnimatedInitialCount.current) {
        hasAnimatedInitialCount.current = true;
        animateToCount(nextCount);
        return;
      }

      setCount(nextCount);
    };

    const loadInitialCount = async () => {
      try {
        const countResponse = await getWaitlistCount();
        let resolvedCount = getCountFromPayload(countResponse);

        if (resolvedCount === null) {
          const entriesResponse = await getWaitlistEntries();
          resolvedCount = getCountFromPayload(entriesResponse);
        }

        if (isMounted && resolvedCount !== null) {
          applyCount(resolvedCount, true);
        }
      } catch (error) {
        try {
          const entriesResponse = await getWaitlistEntries();
          const fallbackCount = getCountFromPayload(entriesResponse);

          if (isMounted && fallbackCount !== null) {
            applyCount(fallbackCount, true);
          }
        } catch (fallbackError) {
          console.error("Failed to fetch waitlist count:", fallbackError.message);
        }
      } finally {
        if (isMounted) {
          if (!hasAnimatedInitialCount.current) {
            hasAnimatedInitialCount.current = true;
          }
          setIsLoading(false);
        }
      }
    };

    loadInitialCount();

    const socket = initializeSocket();
    const handleCountUpdate = (payload) => {
      if (!isMounted) return;

      const realtimeCount = getCountFromPayload(payload);
      if (realtimeCount !== null) {
        applyCount(realtimeCount, false);
      }
      setIsLoading(false);
    };

    socket.on(WAITLIST_COUNT_EVENT, handleCountUpdate);
    socket.emit("waitlist:count:request");

    return () => {
      isMounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      socket.off(WAITLIST_COUNT_EVENT, handleCountUpdate);
    };
  }, [enabled]);

  return { count, isLoading };
};

export default useWaitlistCount;

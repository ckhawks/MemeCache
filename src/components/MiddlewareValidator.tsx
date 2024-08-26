'use client';

// import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function MiddlewareValidator() {
  const router = useRouter();

  useEffect(() => {
    const validateSession = async () => {
      const middlewareRun = document.cookie.includes('middleware_run=true');

      if (!middlewareRun) {
        // If middleware hasn't run, reload the page
        window.location.reload();
        return;
      }

      // try {
      //   const res = await fetch('/api/validate-session');
      //   const data = await res.json();

      //   if (data.isLoggedIn) {
      //     // Update your global state management (e.g., Redux, Context) with user data
      //     // For example: setUser(data.user);
      //   } else {
      //     // Redirect to login or update state to show as logged out
      //     // router.push('/login');
      //   }
      // } catch (error) {
      //   console.error('Error validating session:', error);
      // }
      //  finally {
      //   setIsLoading(false);
      // }
    };

    validateSession();
  }, [router]);

  return <></>;
}

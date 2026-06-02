import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { api } from '../api/client';
import { authLoadingAtom, tutorAtom } from '../atoms/auth';

export function AuthBootstrap() {
  const setTutor = useSetAtom(tutorAtom);
  const setLoading = useSetAtom(authLoadingAtom);

  useEffect(() => {
    api
      .me()
      .then(({ tutor }) => setTutor(tutor))
      .catch(() => setTutor(null))
      .finally(() => setLoading(false));
  }, [setTutor, setLoading]);

  return null;
}

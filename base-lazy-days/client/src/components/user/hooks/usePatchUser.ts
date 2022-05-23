import jsonpatch from 'fast-json-patch';
import { UseMutateFunction, useMutation, useQueryClient } from 'react-query';

import type { User } from '../../../../../shared/types';
import { axiosInstance, getJWTHeader } from '../../../axiosInstance';
import { queryKeys } from '../../../react-query/constants';
import { useCustomToast } from '../../app/hooks/useCustomToast';
import { useUser } from './useUser';

async function patchUserOnServer(
  newData: User | null,
  originalData: User | null,
): Promise<User | null> {
  if (!newData || !originalData) return null;
  // create a patch for the difference between newData and originalData
  const patch = jsonpatch.compare(originalData, newData);

  // send patched data to the server
  const { data } = await axiosInstance.patch(
    `/user/${originalData.id}`,
    { patch },
    {
      headers: getJWTHeader(originalData),
    },
  );
  return data.user;
}

export function usePatchUser(): UseMutateFunction<
  User,
  unknown,
  User,
  unknown
> {
  const { user, updateUser } = useUser();
  const toast = useCustomToast();
  const queryClient = useQueryClient();

  const { mutate: patchUser } = useMutation(
    (newUserData: User) => patchUserOnServer(newUserData, user),
    {
      // onMutate returns context that is passed to onError
      onMutate: async (newData: User | null) => {
        // cancel any ongoing queries for user data
        // so old server data does not overwrite our optimistic data
        queryClient.cancelQueries(queryKeys.user);

        // snapshot of previous user data
        const previousData: User = queryClient.getQueryData(queryKeys.user);

        // optimistic update the cache with new user data
        updateUser(newData);

        // return context snapshot with previous data
        return { previousData };
      },
      onSuccess: () => {
        if (user) {
          toast({
            title: 'User updated sucessfully',
            status: 'success',
          });
        }
      },
      onError: (error, newData, context) => {
        // rollback cache to saved value
        updateUser(context.previousData);
        toast({
          title: 'Update failed, restoring previous data',
          status: 'error',
        });
      },
      onSettled: () => {
        // invalidate user query to make sure we are in sync with server data
        queryClient.invalidateQueries(queryKeys.user);
      },
    },
  );

  return patchUser;
}

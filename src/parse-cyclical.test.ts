import { z } from "zod";
import { parseCyclical } from "./parse-cyclical";

it("should give me a correct validated node from id", () => {
  interface User {
    name: string;
    friend?: User;
  }

  const User: z.ZodType<User> = z.lazy(() =>
    z.object({
      name: z.string(),
      friend: User.optional(),
    })
  );

  const userA: User = {
    name: "aaa",
  };

  const userB: User = {
    name: "bbb",
  };

  userA.friend = userB;
  userB.friend = userA;

  const [user] = parseCyclical(userA, User);
  expect(user).toMatchObject({
    name: "aaa",
    friend: {
      name: "bbb",
      friend: {
        name: "aaa",
        friend: {},
      },
    },
  });
});

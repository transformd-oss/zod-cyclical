import { z } from "zod";
import { parseCyclical } from "./parse-cyclical";

it("should give me a correct validated node from id", () => {
  interface User {
    name: string;
    friend: User;
    ofriend?: User;
  }

  const User: z.ZodType<User> = z.lazy(() =>
    z.object({
      name: z.string(),
      friend: User,
      ofriend: User.optional(),
    })
  );

  const userA: User = {
    name: "aaa",
    friend: {} as User,
  };

  const userB: User = {
    name: "bbb",
    friend: {} as User,
  };

  userA.friend = userB;
  userA.ofriend = userB;
  userB.friend = userA;
  userB.ofriend = userA;

  const $ = parseCyclical(userA, User);
  expect($).toMatchObject({
    success: true,
    data: {
      name: "aaa",
      friend: {
        name: "bbb",
        friend: {
          name: "aaa",
          friend: {},
        },
      },
    },
  });
});

it("test", () => {
  {
    const $ = z.object({ keyS: z.string() }).safeParse("abc");
    expect($).toBeTruthy();
  }
  {
    const $ = z
      .object({ keyO: z.object({ keyO_: z.string() }) })
      .safeParse({ keyO: { keyO_: true } });
    expect($).toBeTruthy();
  }
});

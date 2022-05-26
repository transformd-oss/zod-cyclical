import { z } from "zod";
import { parse } from "./parse";

it("should handle a simple schema", () => {
  const $ = z.string();

  expect(parse($, "abc").success).toBeTruthy();
  expect(parse($, 123).success).toBeFalsy();
});

it("should give me a correct validated node from id", () => {
  interface User {
    name: string;
    friend: User;
    ofriend?: User;
    friends: User[];
  }

  const User: z.ZodType<User> = z.lazy(() =>
    z.object({
      name: z.string(),
      friend: User,
      ofriend: User.optional(),
      friends: z.array(User),
    })
  );

  const userA: User = {
    name: "aaa",
    friend: {} as User,
    friends: [],
  };

  const userB: User = {
    name: "bbb",
    friend: {} as User,
    friends: [],
  };

  userA.friend = userB;
  userA.ofriend = userB;
  userA.friends = [userB];
  userB.friend = userA;
  userB.ofriend = userA;
  userB.friends = [userA];

  const $ = parse(User, userA);
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

it("should fail with invalid input", () => {
  interface Collection {
    fields: Record<
      string,
      | { schema: { type: string } }
      | { relationship: { collection: Collection } }
    >;
  }

  const Collection: z.ZodType<Collection> = z.lazy(() =>
    z.object({
      fields: z.record(
        z.union([
          z.object({ schema: z.object({ type: z.string() }) }),
          z.object({ relationship: z.object({ collection: Collection }) }),
        ])
      ),
    })
  );

  const Schema = z.record(Collection);

  const collectionA = {
    fields: {
      bar: {
        relationship: {
          collection: {},
        },
      },
    },
  };

  const collectionB = {
    fields: {
      foo: {
        schema: {
          type: 123, // should be string
        },
      },
      bar: {
        relationship: {
          collection: collectionA,
        },
      },
    },
  };

  collectionA.fields.bar.relationship.collection = collectionB;

  const schema = {
    a: collectionA,
    b: collectionB,
  };

  const $ = parse(Schema, schema);
  expect($).toMatchObject({
    success: false,
  });
  expect(
    JSON.stringify($).includes("Expected string, received number")
  ).toBeTruthy();
});

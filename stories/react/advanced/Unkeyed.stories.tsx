import { Meta, StoryObj } from "@storybook/react";
import React, { useEffect, useState } from "react";
import { VList } from "../../../src";

export default {
  component: VList,
} as Meta;

function HeavyItem(props: { index: number }) {
  const [inited, setInited] = useState(false);

  useEffect(() => {
    let unmounted = false;

    setTimeout(() => {
      if (!unmounted) setInited(true);
    }, 1000);

    return () => {
      unmounted = true;
    };
  }, []);

  return (
    <div style={{ padding: "5px 20px" }}>
      {inited ? props.index : "Initializing"}
    </div>
  );
}

function List(props: { unkeyed: boolean }) {
  return (
    <div style={{ flex: 1, padding: 10 }}>
      <VList
        style={{ border: "1px solid black" }}
        count={1000}
        unkeyed={props.unkeyed}
      >
        {(index) => <HeavyItem index={index} />}
      </VList>
    </div>
  );
}

export const Default: StoryObj = {
  name: "Unkeyed",
  render() {
    return (
      <div style={{ height: "100vh", display: "flex" }}>
        <List unkeyed={false} />
        <List unkeyed={true} />
      </div>
    );
  },
};

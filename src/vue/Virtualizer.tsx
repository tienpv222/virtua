/** @jsxImportSource vue */
import {
  ref,
  onMounted,
  defineComponent,
  onUnmounted,
  VNode,
  watch,
  ComponentOptionsMixin,
  SlotsType,
  ComponentOptionsWithObjectProps,
  ComponentObjectPropsOptions,
  PropType,
  NativeElements,
  computed,
} from "vue";
import {
  UPDATE_SCROLL_EVENT,
  UPDATE_SCROLL_END_EVENT,
  UPDATE_VIRTUAL_STATE,
  createVirtualStore,
  ACTION_ITEMS_LENGTH_CHANGE,
  getScrollSize,
  ACTION_START_OFFSET_CHANGE,
} from "../core/store";
import { createResizer } from "../core/resizer";
import { createScroller } from "../core/scroller";
import { ItemsRange, ScrollToIndexOpts } from "../core/types";
import { ListItem } from "./ListItem";
import { getKey, isSameRange } from "./utils";
import { microtask } from "../core/utils";

export interface VirtualizerHandle {
  /**
   * Get current scrollTop, or scrollLeft if horizontal: true.
   */
  readonly scrollOffset: number;
  /**
   * Get current scrollHeight, or scrollWidth if horizontal: true.
   */
  readonly scrollSize: number;
  /**
   * Get current offsetHeight, or offsetWidth if horizontal: true.
   */
  readonly viewportSize: number;
  /**
   * Find the start index of visible range of items.
   */
  findStartIndex: () => number;
  /**
   * Find the end index of visible range of items.
   */
  findEndIndex: () => number;
  /**
   * Get item offset from start.
   * @param index index of item
   */
  getItemOffset(index: number): number;
  /**
   * Get item size.
   * @param index index of item
   */
  getItemSize(index: number): number;
  /**
   * Scroll to the item specified by index.
   * @param index index of item
   * @param opts options
   */
  scrollToIndex(index: number, opts?: ScrollToIndexOpts): void;
  /**
   * Scroll to the given offset.
   * @param offset offset from start
   */
  scrollTo(offset: number): void;
  /**
   * Scroll by the given offset.
   * @param offset offset from current position
   */
  scrollBy(offset: number): void;
}

const props = {
  /**
   * The data items rendered by this component.
   */
  data: { type: Array, required: true },
  /**
   * Number of items to render above/below the visible bounds of the list. You can increase to avoid showing blank items in fast scrolling.
   * @defaultValue 4
   */
  overscan: Number,
  /**
   * Item size hint for unmeasured items. It will help to reduce scroll jump when items are measured if used properly.
   *
   * - If not set, initial item sizes will be automatically estimated from measured sizes. This is recommended for most cases.
   * - If set, you can opt out estimation and use the value as initial item size.
   */
  itemSize: Number,
  /**
   * While true is set, scroll position will be maintained from the end not usual start when items are added to/removed from start. It's recommended to set false if you add to/remove from mid/end of the list because it can cause unexpected behavior. This prop is useful for reverse infinite scrolling.
   */
  shift: Boolean,
  /**
   * If true, rendered as a horizontally scrollable list. Otherwise rendered as a vertically scrollable list.
   */
  horizontal: Boolean,
  /**
   * If you put an element before virtualizer, you have to define its height with this prop.
   */
  startMargin: { type: Number, default: 0 },
  /**
   * A prop for SSR. If set, the specified amount of items will be mounted in the initial rendering regardless of the container size until hydrated.
   */
  ssrCount: Number,
  /**
   * Reference to the scrollable element. The default will get the direct parent element of virtualizer.
   */
  scrollRef: Object as PropType<HTMLElement>,
  /**
   * Component or element type for container element.
   * @defaultValue "div"
   */
  as: { type: String as PropType<keyof NativeElements>, default: "div" },
  /**
   * Component or element type for item element.
   * @defaultValue "div"
   */
  item: { type: String as PropType<keyof NativeElements>, default: "div" },
} satisfies ComponentObjectPropsOptions;

export const Virtualizer = /*#__PURE__*/ defineComponent({
  props: props,
  emits: ["scroll", "scrollEnd"],
  setup(props, { emit, expose, slots }) {
    let isSSR = !!props.ssrCount;

    const isHorizontal = props.horizontal;
    const containerRef = ref<HTMLDivElement>();
    const store = createVirtualStore(
      props.data.length,
      props.itemSize,
      props.overscan,
      props.ssrCount,
      undefined,
      !props.itemSize
    );
    const resizer = createResizer(store, isHorizontal);
    const scroller = createScroller(store, isHorizontal);

    const rerender = ref(store._getStateVersion());
    const unsubscribeStore = store._subscribe(UPDATE_VIRTUAL_STATE, () => {
      rerender.value = store._getStateVersion();
    });

    const unsubscribeOnScroll = store._subscribe(UPDATE_SCROLL_EVENT, () => {
      emit("scroll", store._getScrollOffset());
    });
    const unsubscribeOnScrollEnd = store._subscribe(
      UPDATE_SCROLL_END_EVENT,
      () => {
        emit("scrollEnd");
      }
    );

    const range = computed<ItemsRange>((prev) => {
      rerender.value;
      const next = store._getRange();
      if (prev && isSameRange(prev, next)) {
        return prev;
      }
      return next;
    });
    const isScrolling = computed(() => rerender.value && store._isScrolling());
    const totalSize = computed(() => rerender.value && store._getTotalSize());
    const jumpCount = computed(() => rerender.value && store._getJumpCount());

    onMounted(() => {
      isSSR = false;

      microtask(() => {
        const assignScrollableElement = (e: HTMLElement) => {
          resizer._observeRoot(e);
          scroller._observe(e);
        };
        if (props.scrollRef) {
          // parent's ref doesn't exist when onMounted is called
          assignScrollableElement(props.scrollRef!);
        } else {
          assignScrollableElement(containerRef.value!.parentElement!);
        }
      });
    });
    onUnmounted(() => {
      unsubscribeStore();
      unsubscribeOnScroll();
      unsubscribeOnScrollEnd();
      resizer._dispose();
      scroller._dispose();
    });

    watch(
      () => props.data.length,
      (count) => {
        store._update(ACTION_ITEMS_LENGTH_CHANGE, [count, props.shift]);
      }
    );
    watch(
      () => props.startMargin,
      (value) => {
        store._update(ACTION_START_OFFSET_CHANGE, value);
      },
      { immediate: true }
    );

    watch(
      [jumpCount],
      () => {
        scroller._fixScrollJump();
      },
      { flush: "post" }
    );

    expose({
      get scrollOffset() {
        return store._getScrollOffset();
      },
      get scrollSize() {
        return getScrollSize(store);
      },
      get viewportSize() {
        return store._getViewportSize();
      },
      findStartIndex: store._findStartIndex,
      findEndIndex: store._findEndIndex,
      getItemOffset: store._getItemOffset,
      getItemSize: store._getItemSize,
      scrollToIndex: scroller._scrollToIndex,
      scrollTo: scroller._scrollTo,
      scrollBy: scroller._scrollBy,
    } satisfies VirtualizerHandle);

    return () => {
      const Element = props.as;
      const ItemElement = props.item;

      const [startIndex, endIndex] = range.value;
      const total = totalSize.value;

      const items: VNode[] = [];
      for (let i = startIndex, j = endIndex; i <= j; i++) {
        const e = slots.default({ item: props.data![i]!, index: i })[0]!;
        items.push(
          <ListItem
            key={getKey(e, i)}
            _rerender={rerender}
            _store={store}
            _resizer={resizer._observeItem}
            _index={i}
            _children={e}
            _isHorizontal={isHorizontal}
            _isSSR={isSSR}
            _as={ItemElement}
          />
        );
      }

      return (
        <Element
          ref={containerRef}
          style={{
            // contain: "content",
            overflowAnchor: "none", // opt out browser's scroll anchoring because it will conflict to scroll anchoring of virtualizer
            flex: "none", // flex style can break layout
            position: "relative",
            visibility: "hidden", // TODO replace with other optimization methods
            width: isHorizontal ? total + "px" : "100%",
            height: isHorizontal ? "100%" : total + "px",
            pointerEvents: isScrolling.value ? "none" : undefined,
          }}
        >
          {items}
        </Element>
      );
    };
  },
} as ComponentOptionsWithObjectProps<
  typeof props,
  VirtualizerHandle,
  {},
  {},
  {},
  ComponentOptionsMixin,
  ComponentOptionsMixin,
  {
    /**
     * Callback invoked whenever scroll offset changes.
     * @param offset Current scrollTop, or scrollLeft if horizontal: true.
     */
    scroll: (offset: number) => void;
    /**
     * Callback invoked when scrolling stops.
     */
    scrollEnd: () => void;
  },
  string,
  {},
  string,
  SlotsType<{ default: (arg: { item: any; index: number }) => VNode[] }>
>);

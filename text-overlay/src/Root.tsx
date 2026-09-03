import { Composition } from "remotion";
import {
  TextOverlay,
  calculateTextOverlayMetadata,
  textOverlayDefaultProps,
} from "./TextOverlay";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TextOverlay"
        component={TextOverlay}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={textOverlayDefaultProps}
        calculateMetadata={calculateTextOverlayMetadata}
      />
    </>
  );
};

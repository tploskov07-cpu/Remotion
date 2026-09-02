import { Composition } from "remotion";
import { TextOverlay, textOverlayDefaultProps } from "./TextOverlay";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TextOverlay"
        component={TextOverlay}
        durationInFrames={120}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={textOverlayDefaultProps}
      />
    </>
  );
};

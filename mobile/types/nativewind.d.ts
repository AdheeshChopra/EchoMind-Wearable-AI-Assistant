import "react-native";

declare module "react-native" {
  interface ViewProps {
    className?: string;
  }
  interface TextProps {
    className?: string;
  }
  interface ImageProps {
    className?: string;
  }
  interface TouchableOpacityProps {
    className?: string;
  }
  interface ScrollViewProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
}

declare module "expo-blur" {
  import { BlurViewProps } from "expo-blur";
  interface BlurViewProps {
    className?: string;
  }
}

declare module "expo-linear-gradient" {
  import { LinearGradientProps } from "expo-linear-gradient";
  interface LinearGradientProps {
    className?: string;
  }
}

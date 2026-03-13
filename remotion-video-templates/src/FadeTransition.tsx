import { AbsoluteFill, useCurrentFrame, interpolate, useVideoConfig } from 'remotion';

interface FadeTransitionProps {
	fromColor: string;
	toColor: string;
}

export const FadeTransition: React.FC<FadeTransitionProps> = ({
	fromColor,
	toColor,
}) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	// Smooth color transition using interpolation
	const opacity = interpolate(frame, [0, 60, 90], [0, 1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill
			style={{
				backgroundColor: fromColor,
			}}
		>
			<AbsoluteFill
				style={{
					backgroundColor: toColor,
					opacity,
				}}
			/>
		</AbsoluteFill>
	);
};

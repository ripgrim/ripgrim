import { AbsoluteFill } from 'remotion';

interface ThumbnailTemplateProps {
	title: string;
	subtitle: string;
	backgroundGradient: string[];
}

export const ThumbnailTemplate: React.FC<ThumbnailTemplateProps> = ({
	title,
	subtitle,
	backgroundGradient,
}) => {
	return (
		<AbsoluteFill
			style={{
				background: `linear-gradient(135deg, ${backgroundGradient[0]}, ${backgroundGradient[1]})`,
				justifyContent: 'center',
				alignItems: 'center',
				padding: '60px',
			}}
		>
			<div
				style={{
					textAlign: 'center',
					width: '100%',
				}}
			>
				<h1
					style={{
						color: 'white',
						fontSize: 80,
						fontWeight: 900,
						margin: 0,
						fontFamily: 'system-ui, -apple-system, sans-serif',
						textShadow: '0 4px 20px rgba(0,0,0,0.3)',
						letterSpacing: '-2px',
						lineHeight: 1.2,
					}}
				>
					{title}
				</h1>
				<p
					style={{
						color: 'white',
						fontSize: 42,
						fontWeight: 600,
						margin: '30px 0 0 0',
						fontFamily: 'system-ui, -apple-system, sans-serif',
						textShadow: '0 2px 10px rgba(0,0,0,0.2)',
						opacity: 0.9,
					}}
				>
					{subtitle}
				</p>
				<div
					style={{
						marginTop: '50px',
						height: '6px',
						background: 'rgba(255,255,255,0.3)',
						borderRadius: '3px',
						width: '60%',
						marginLeft: 'auto',
						marginRight: 'auto',
					}}
				/>
			</div>
		</AbsoluteFill>
	);
};

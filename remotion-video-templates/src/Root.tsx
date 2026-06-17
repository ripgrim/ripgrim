import { Composition, Folder, Still } from 'remotion';
import { IntroTemplate } from './IntroTemplate';
import { TypewriterTitle } from './TypewriterTitle';
import { FadeTransition } from './FadeTransition';
import { SocialMediaPost } from './SocialMediaPost';
import { ProductShowcase } from './ProductShowcase';
import { ThumbnailTemplate } from './ThumbnailTemplate';

export const RemotionRoot = () => {
	return (
		<>
			<Folder name="intros">
				<Composition
					id="IntroTemplate"
					component={IntroTemplate}
					durationInFrames={150}
					fps={30}
					width={1920}
					height={1080}
					defaultProps={{
						title: 'Welcome',
						subtitle: 'To My Channel',
						backgroundColor: '#1a1a2e',
						textColor: '#ffffff',
					}}
				/>
			</Folder>

			<Folder name="titles">
				<Composition
					id="TypewriterTitle"
					component={TypewriterTitle}
					durationInFrames={120}
					fps={30}
					width={1920}
					height={1080}
					defaultProps={{
						text: 'Hello World',
						fontSize: 96,
						textColor: '#000000',
						backgroundColor: '#ffffff',
					}}
				/>
			</Folder>

			<Folder name="transitions">
				<Composition
					id="FadeTransition"
					component={FadeTransition}
					durationInFrames={90}
					fps={30}
					width={1920}
					height={1080}
					defaultProps={{
						fromColor: '#ff6b6b',
						toColor: '#4ecdc4',
					}}
				/>
			</Folder>

			<Folder name="social">
				<Composition
					id="SocialMediaPost"
					component={SocialMediaPost}
					durationInFrames={180}
					fps={30}
					width={1080}
					height={1080}
					defaultProps={{
						title: 'Amazing Content',
						description: 'Check this out!',
						accentColor: '#ff6b6b',
					}}
				/>
			</Folder>

			<Folder name="product">
				<Composition
					id="ProductShowcase"
					component={ProductShowcase}
					durationInFrames={240}
					fps={30}
					width={1920}
					height={1080}
					defaultProps={{
						productName: 'Awesome Product',
						tagline: 'The best choice',
						primaryColor: '#6c5ce7',
						secondaryColor: '#a29bfe',
					}}
				/>
			</Folder>

			<Folder name="thumbnails">
				<Still
					id="ThumbnailTemplate"
					component={ThumbnailTemplate}
					width={1280}
					height={720}
					defaultProps={{
						title: 'Video Title',
						subtitle: 'Engaging Subtitle',
						backgroundGradient: ['#ff6b6b', '#ff8e53'],
					}}
				/>
			</Folder>
		</>
	);
};

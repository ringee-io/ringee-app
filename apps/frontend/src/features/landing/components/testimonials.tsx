import { Avatar, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import Marquee from './ui/marquee';
import Link from 'next/link';
import React, { ComponentProps } from 'react';

const testimonials = [
  {
    id: 1,
    name: 'John Doe',
    designation: 'Software Engineer',
    company: 'TechCorp',
    testimonial:
      'This product has completely transformed the way we work. The efficiency and ease of use are unmatched!',
    avatar: 'https://randomuser.me/api/portraits/men/1.jpg'
  },
  {
    id: 2,
    name: 'Sophia Lee',
    designation: 'Data Analyst',
    company: 'InsightTech',
    testimonial:
      'This tool has saved me hours of work! The analytics and reporting features are incredibly powerful.',
    avatar: 'https://randomuser.me/api/portraits/women/6.jpg'
  },
  {
    id: 3,
    name: 'Michael Johnson',
    designation: 'UX Designer',
    company: 'DesignPro',
    testimonial:
      'An amazing tool that simplifies complex tasks. Highly recommended for professionals in the industry.',
    avatar: 'https://randomuser.me/api/portraits/men/3.jpg'
  },
  {
    id: 4,
    name: 'Emily Davis',
    designation: 'Marketing Specialist',
    company: 'BrandBoost',
    testimonial:
      "I've seen a significant improvement in our team's productivity since we started using this service.",
    avatar: 'https://randomuser.me/api/portraits/women/4.jpg'
  },
  {
    id: 5,
    name: 'Daniel Martinez',
    designation: 'Full-Stack Developer',
    company: 'CodeCrafters',
    testimonial:
      "The best investment we've made! The support team is also super responsive and helpful.",
    avatar: 'https://randomuser.me/api/portraits/men/5.jpg'
  },
  {
    id: 6,
    name: 'Jane Smith',
    designation: 'Product Manager',
    company: 'InnovateX',
    testimonial:
      'The user experience is top-notch! The interface is clean, intuitive, and easy to navigate.',
    avatar: 'https://randomuser.me/api/portraits/women/2.jpg'
  }
];

const Testimonials = () => (
  <div id='testimonials' className='flex items-center justify-center py-20'>
    <div className='h-full w-full'>
      <h2 className='mb-12 px-6 text-center text-4xl font-bold tracking-tight md:text-5xl'>
        Testimonials
      </h2>
      <div className='relative'>
        <div className='from-background absolute inset-y-0 left-0 z-10 w-[15%] bg-gradient-to-r to-transparent' />
        <div className='from-background absolute inset-y-0 right-0 z-10 w-[15%] bg-gradient-to-l to-transparent' />
        <Marquee pauseOnHover className='[--duration:20s]'>
          <TestimonialList />
        </Marquee>
        <Marquee pauseOnHover reverse className='mt-0 [--duration:20s]'>
          <TestimonialList />
        </Marquee>
      </div>
    </div>
  </div>
);

const TestimonialList = () =>
  testimonials.map((testimonial) => (
    <div
      key={testimonial.id}
      className='bg-accent max-w-sm min-w-96 rounded-xl p-6'
    >
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-4'>
          <Avatar>
            <AvatarFallback className='bg-primary text-primary-foreground text-xl font-medium'>
              {testimonial.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className='text-lg font-semibold'>{testimonial.name}</p>
            <p className='text-sm text-gray-500'>{testimonial.designation}</p>
          </div>
        </div>
        <Button variant='ghost' size='icon' asChild>
          <Link href='#' target='_blank'>
            <TwitterLogo className='h-4 w-4' />
          </Link>
        </Button>
      </div>
      <p className='mt-5 text-[17px]'>{testimonial.testimonial}</p>
    </div>
  ));

const TwitterLogo = (props: ComponentProps<'svg'>) => (
  <svg
    role='img'
    viewBox='0 0 24 24'
    xmlns='http://www.w3.org/2000/svg'
    {...props}
  >
    <title>X</title>
    <path
      fill='currentColor'
      d='M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z'
    />
  </svg>
);

export default Testimonials;

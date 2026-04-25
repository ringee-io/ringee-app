export default function DocsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html:
            'html,body{overflow:auto!important;overscroll-behavior:auto!important;height:auto!important}'
        }}
      />
      {children}
    </>
  );
}

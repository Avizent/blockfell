export default async (page, h) => {
  await h.wait(5000);
  await h.shot('title');
  console.log(JSON.stringify(await h.state()));
};
